/* eslint-disable @typescript-eslint/ban-ts-comment */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import { io } from 'socket.io-client';
import { BehaviorSubject, Subject } from 'rxjs';

// const socket = io('http://54.254.81.80:3000');
const socket = io('http://localhost:3000');

socket.on('server_want_force_restart', () => {
  console.warn('server want force restart');
  ipcRenderer.send('force_restart', 'ping');
});

function blobToArrayBuffer(blob: Blob, cb: any) {
  const fileReader = new FileReader();
  // eslint-disable-next-line func-names
  fileReader.onload = function () {
    cb(this.result);
  };
  fileReader.readAsArrayBuffer(blob);
}

const stream$ = new BehaviorSubject<{
  stream: MediaStream;
  time: number;
} | null>(null);

let lastTimeSendScreenData: number;
const screenData$ = new Subject<{
  data: Uint8Array;
  id: number;
  order: number;
  time: number;
}>();

stream$.pipe().subscribe({
  next: (d) => {
    const so = d;
    if (!so) {
      return;
    }
    const mediaStream = new MediaStream();
    const videoTrack = so.stream.getVideoTracks()[0];
    mediaStream.addTrack(videoTrack);
    const recorderOptions = {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 300000, // 3 Mbit/sec.
    };
    const mediaRecorder = new MediaRecorder(mediaStream, recorderOptions);
    let order = 0;
    const id = Math.round(+new Date() / 1000);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        // const reader = new FileReader();
        // reader.readAsArrayBuffer(event.data);
        // const arrayBuffer = reader.result;
        // // @ts-ignore
        // const uint8View = new Uint8Array(arrayBuffer);
        // socket.emit('screen_data', uint8View);

        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        blobToArrayBuffer(event.data, (buffer: any) => {
          // ipcRenderer.send('streaming_data', 'ping');
          // socket.emit('screen_data', new Uint8Array(buffer));
          screenData$.next({
            data: new Uint8Array(buffer),
            order,
            id,
            time: Math.round(+new Date() / 1000),
          });
          // eslint-disable-next-line no-plusplus
          order++;
        });
      }
    };
    mediaRecorder.start(2000);
  },
});
screenData$.pipe().subscribe({
  next: (sd) => {
    if (sd.order > 0 && sd.time - lastTimeSendScreenData > 4) {
      console.warn('2 lan truyen du lieu qua xa nhau');
      // Dữ liệu ở đây đã bị sai, có thể do lock screen
      // Truyền lại từ đầu
      ipcRenderer.send('force_restart', 'ping');

      return;
    }
    lastTimeSendScreenData = sd.time;
    ipcRenderer.send('streaming_data', 'ping');
    socket.emit('screen_data', {
      data: sd.data,
      order: sd.order,
      id: sd.id,
    });
    console.log(`truyen stream data ${sd.id} - ${sd.order}`);
  },
});

/*----------------------------------------*/

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    myPing() {
      ipcRenderer.send('ipc-example', 'ping');
    },
    on(channel: string, func: (...args: unknown[]) => void) {
      const validChannels = ['ipc-example'];
      if (validChannels.includes(channel)) {
        const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
          func(...args);
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, subscription);

        return () => ipcRenderer.removeListener(channel, subscription);
      }

      return undefined;
    },
    once(channel: string, func: (...args: unknown[]) => void) {
      const validChannels = ['ipc-example'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.once(channel, (_event, ...args) => func(...args));
      }
    },
  },
});

ipcRenderer.on('SET_SOURCE', async (_event, sourceId) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-ignore
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1280,
          maxWidth: 1280,
          minHeight: 720,
          maxHeight: 720,
        },
      },
    });

    stream$.next({ stream, time: new Date().getTime() });
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    // sendMediaToSocket(stream);
  } catch (e) {
    console.log('error when get source screen', e);
  }
});
