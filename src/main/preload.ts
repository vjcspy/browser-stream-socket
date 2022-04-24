/* eslint-disable @typescript-eslint/ban-ts-comment */
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

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

function blobToArrayBuffer(blob: Blob, cb: any) {
  const fileReader = new FileReader();
  fileReader.onload = function () {
    cb(this.result);
  };
  fileReader.readAsArrayBuffer(blob);
}

function sendMediaToSocket(screenStream: MediaStream) {
  const mediaStream = new MediaStream();
  const videoTrack = screenStream.getVideoTracks()[0];
  mediaStream.addTrack(videoTrack);
  const recorderOptions = {
    mimeType: 'video/webm;codecs=vp8',
    videoBitsPerSecond: 3500000, // 3.5 Mbit/sec.
  };
  const mediaRecorder = new MediaRecorder(mediaStream, recorderOptions);
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
        ipcRenderer.send('streaming_data', 'ping');
        socket.emit('screen_data', new Uint8Array(buffer));
      });
    }
  };
  mediaRecorder.start(1000);
}

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
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    sendMediaToSocket(stream);
  } catch (e) {
    console.log('error when get source screen', e);
  }
});
