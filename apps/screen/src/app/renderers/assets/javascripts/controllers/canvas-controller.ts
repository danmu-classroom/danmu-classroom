import { Controller } from '@hotwired/stimulus';
import { DanmuCanvas } from '@danmu/screen-core';
import type { AppConfig, Room } from '../../../../core/models';

export class CanvasController extends Controller {
  static targets = ['roomKey', 'canvas'];
  static values = {
    appConfig: Object,
    room: Object,
  };

  declare appConfigValue: AppConfig;
  declare canvasTarget: HTMLCanvasElement;
  danmuCanvas: DanmuCanvas;
  declare roomKeyTarget: HTMLElement;
  declare roomValue: Room;

  connect() {
    this.danmuCanvas = new DanmuCanvas(this.canvasTarget, this.appConfigValue.danmu);

    // The room may have been created before this window finished loading
    void window.danmu.getRoom().then((room) => room && this.showRoom(room));
    window.danmu.onRoomCreated((room) => this.showRoom(room));

    window.danmu.onTestDanmu((testDanmu) => this.danmuCanvas.add(testDanmu));
    window.danmu.onDanmu((danmu) => this.danmuCanvas.add(danmu.content));
    window.danmu.onDanmuConfigUpdated((danmu) => {
      this.appConfigValue = { ...this.appConfigValue, danmu };
      this.danmuCanvas.setConfig(danmu);
    });

    this.resize();
    this.danmuCanvas.start();
  }

  disconnect() {
    this.danmuCanvas.stop();
  }

  resize() {
    this.danmuCanvas.resize(window.innerWidth, window.innerHeight);
  }

  private showRoom(room: Room) {
    this.roomValue = room;
    this.roomKeyTarget.innerText = room.key;
  }
}
