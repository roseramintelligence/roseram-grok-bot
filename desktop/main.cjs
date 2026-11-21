const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createPublicKey, verify } = require('node:crypto');
const path = require('node:path');
const config = require('./release-config.json');
const { developerApp, registerDeveloperNative } = require('./developer-native.cjs');
const selectedApp = developerApp();
app.setName('Roseram-' + selectedApp.slug);
app.setPath('userData', path.join(app.getPath('appData'), 'Roseram-' + selectedApp.slug));
let mainWindow, updating = false;
const devOrigin = !app.isPackaged && process.env.ROSERAM_DEV_ORIGIN;
const appOrigin = devOrigin && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(devOrigin) ? devOrigin : config.appOrigin;
function allowed(url) { try { return new URL(url).origin === appOrigin; } catch { return false; } }
function external(url) { try { const parsed = new URL(url); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) shell.openExternal(parsed.href); } catch {} }
function version(value) { if (!/^\d+\.\d+\.\d+$/.test(value)) throw Error('Invalid version'); return value.split('.').map(Number); }
function compare(a,b) { const left=version(a),right=version(b);for(let i=0;i<3;i++)if(left[i]!==right[i])return left[i]>right[i]?1:-1;return 0; }
async function checkUpdates() {
  if (!app.isPackaged || !config.releasePublicKey) return {status:'development',message:'Signed native releases are not configured.'};
  if (updating) return {status:'checking'};
  updating = true;
  try {
    const response = await fetch(config.manifestUrl,{signal:AbortSignal.timeout(15000),cache:'no-store'});
    if (!response.ok) throw Error('Update service unavailable');
    const envelope = await response.json(), bytes = Buffer.from(envelope.payload,'base64');
    const key = createPublicKey({key:Buffer.from(config.releasePublicKey,'base64'),format:'der',type:'spki'});
    if (key.asymmetricKeyType!=='ed25519'||!verify(null,bytes,key,Buffer.from(envelope.signature,'base64'))) throw Error('Invalid update signature');
    const manifest=JSON.parse(bytes),release=manifest.clients?.desktop;
    if (manifest.schemaVersion!==1||manifest.appOrigin!==config.appOrigin||!release) throw Error('Unsupported update manifest');
    const required=compare(app.getVersion(),release.minimumVersion)<0;
    if(compare(release.version,app.getVersion())<=0)return {status:'current'};
    if(release.status!=='released'||!release.feedUrl||!config.artifactOrigins.includes(new URL(release.feedUrl).origin)||new URL(release.feedUrl).protocol!=='https:')throw Error('Unpublished desktop release');
    // electron-updater additionally enforces artifact hashes and OS code signing.
    autoUpdater.setFeedURL({provider:'generic',url:release.feedUrl});
    autoUpdater.autoDownload=true;autoUpdater.autoInstallOnAppQuit=true;autoUpdater.allowDowngrade=false;
    await autoUpdater.checkForUpdates();
    return {status:'downloading',required};
  } catch { return {status:'unavailable',message:'The installed version is unchanged; update verification failed.'}; }
  finally {updating=false;}
}
function createWindow() {
  mainWindow=new BrowserWindow({width:1440,height:950,minWidth:820,minHeight:600,icon:path.join(__dirname,'build','icon.png'),show:process.env.ROSERAM_CLIENT_TEST!=='1',backgroundColor:'#edf2f8',title:'Roseram',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,partition:'persist:roseram-' + selectedApp.slug}});
  const contents=mainWindow.webContents;
  contents.session.setPermissionRequestHandler((_wc,permission,callback,details)=>{callback(allowed(details.requestingUrl)&&permission==='clipboard-sanitized-write');});
  contents.session.setPermissionCheckHandler((_wc,permission,origin)=>allowed(origin)&&permission==='clipboard-sanitized-write');
  contents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
  contents.on('will-navigate',(event,url)=>{if(!allowed(url)){event.preventDefault();external(url);}});
  contents.on('will-attach-webview',event=>event.preventDefault());
  contents.on('did-fail-load',(_event,code)=>{if(code!==-3)dialog.showMessageBox(mainWindow,{type:'warning',message:'Roseram could not be reached.',detail:'Check your connection and choose View → Reload to retry. Your saved account projects remain on the server.'});});
  mainWindow.loadURL(appOrigin+'/downloads/'+selectedApp.slug+'?run=1&client=desktop&client_version='+app.getVersion()+'#workspace');
  mainWindow.on('closed',()=>{mainWindow=null;});
}
app.enableSandbox();
if(!app.requestSingleInstanceLock())app.quit();else {
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}});
  app.whenReady().then(()=>{
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Roseram',submenu:[{label:'Check for updates',click:async()=>{const result=await checkUpdates();dialog.showMessageBox(mainWindow,{message:result.message||'Update status: '+result.status});}},{role:'quit'}]},{role:'editMenu'},{role:'viewMenu'}]));
    ipcMain.handle('roseram:check-updates',event=>{if(!allowed(event.senderFrame?.url))throw Error('Untrusted update request');return checkUpdates();});
    autoUpdater.on('error',()=>{});
    registerDeveloperNative({ window: () => mainWindow, appOrigin, userData: app.getPath('userData') });
    createWindow();checkUpdates();setInterval(checkUpdates,6*60*60*1000).unref();
    app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});
  });
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
}
