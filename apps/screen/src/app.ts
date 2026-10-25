import {
  app,
  BrowserWindow,
  Display,
  globalShortcut,
  ipcMain,
  screen,
  shell,
  Tray,
} from 'electron';
import logger from 'electron-log/main';
import { DanmuConfig, Room } from './app/core/models';
import {
  createCanvasWindow,
  createDashboardWindow,
  createTray,
} from './app/core/use-cases/create-main-process-modules';
import { appConfig, env } from './app/core/use-cases/init-app';
import { ScreenConnection } from '@danmu/screen-core';

export class App {
  app = app;
  env = env;

  private canvasWindow: BrowserWindow;
  private config = appConfig;
  private connection: ScreenConnection;
  private dashboardWindow: BrowserWindow;
  private displays: Display[];
  private room: Room | null = null;
  private tray: Tray;

  run() {
    logger.info(`app @ is running at ${this.env} mode, upstream ${this.config.upstream}`);

    // Main process event listeners
    this.app
      .whenReady()
      .then(async () => {
        // Handlers first, so renderers can ask for config/room as soon as they load
        this.registerIpcMainHandlers();
        await this.createMainProcessModules();
        this.displays = screen.getAllDisplays();
        this.registerGlobalShortcuts();

        this.connectToServer();
      })
      .catch((error: unknown) => logger.error('app @ init failed:', error));

    this.app.on('activate', () => this.dashboardWindow?.show());

    this.app.on('window-all-closed', () => {
      if (process.platform === 'darwin') return;

      app.quit();
    });

    this.app.on('will-quit', () => this.connection?.stop());
  }

  // Opens a room and receives its danmus over a WebSocket; a new room is opened
  // automatically when the server closes the old one (after 3 hours).
  private connectToServer() {
    this.connection = new ScreenConnection({
      upstream: this.config.upstream,
      onDanmu: (danmu) => this.canvasWindow.webContents.send('app:danmu', danmu),
      onError: (error) => logger.error('app @ connection error:', error),
      onRoom: (room) => {
        this.room = room;
        logger.info(`app @ room ${room.key} created`);
        this.canvasWindow.webContents.send('app:roomCreated', room);
        this.dashboardWindow.webContents.send('app:roomCreated', room);
      },
    });
    this.connection.start();
  }

  private async createMainProcessModules() {
    [this.canvasWindow, this.dashboardWindow] = await Promise.all([
      createCanvasWindow(),
      createDashboardWindow(),
    ]);
    logger.info('app @ canvas and dashboard windows created');
    this.tray = createTray(this.dashboardWindow);
  }

  // eslint-disable-next-line class-methods-use-this
  private openLogDir() {
    shell.showItemInFolder(logger.transports.file.getFile().path);
  }

  private registerGlobalShortcuts() {
    // Global shortcuts
    globalShortcut.register('CmdOrCtrl+Alt+I', () =>
      this.dashboardWindow.webContents.openDevTools(),
    );

    globalShortcut.register('CmdOrCtrl+Alt+L', () => this.openLogDir());
  }

  private registerIpcMainHandlers() {
    ipcMain.on('app:exit', () => {
      this.canvasWindow.destroy();
      this.dashboardWindow.destroy();
      this.tray.destroy();
      // Send before-quit event
      // Quit event order: before-quit > will-quit > quit
      app.quit();
    });

    ipcMain.on('app:log', (_event, level: 'info' | 'error', ...params: unknown[]) =>
      logger[level](...params),
    );

    ipcMain.on('app:openLogDir', () => this.openLogDir());

    ipcMain.on('dashboard:sendTestDanmu', (_event, content: string) => {
      this.canvasWindow.webContents.send('app:testDanmu', content);
    });

    ipcMain.on('dashboard:updateDanmuConfig', (_event, danmuConfig: DanmuConfig) => {
      this.config = { ...this.config, danmu: danmuConfig };
      this.canvasWindow.webContents.send('app:danmuConfigUpdated', danmuConfig);
    });

    ipcMain.on('dashboard:changeCanvasDisplay', (_event, displayId: number) => {
      const display = this.displays.find((it) => it.id === displayId);
      if (display == null) return;

      this.canvasWindow.setBounds(display.bounds);
    });

    ipcMain.handle('app:getConfig', () => this.config);

    ipcMain.handle('app:getRoom', () => this.room);

    ipcMain.handle('app:getDisplays', () => {
      this.displays ||= screen.getAllDisplays();
      return this.displays;
    });
  }
}
