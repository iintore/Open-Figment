// Narrow bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('figmentDesktop', {
  platform: process.platform,
  onMenu(callback) {
    const listener = (_event, channel) => {
      if (typeof channel === 'string') callback(channel);
    };
    ipcRenderer.on('menu', listener);
    return () => ipcRenderer.removeListener('menu', listener);
  },
  newWindow(hash) {
    return ipcRenderer.invoke('figment:new-window', hash);
  },
});
