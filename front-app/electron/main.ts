import { app, BrowserWindow, Menu, Tray, shell, ipcMain } from "electron";
// import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { exec } from "child_process"; // exec 추가
import iconv from "iconv-lite"; // iconv-lite 추가
import { promisify } from "util";

// const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuiting = false;  // 애플리케이션 종료 상태를 추적하는 변수

const execAsync = promisify(exec);


// 새로운 Electron 창 오픈
async function createWindow() {
  win = new BrowserWindow({
    frame:false,
    titleBarStyle: 'hidden',
    width: 1000,
    height: 800,
    // titleBarOverlay: {
    //   color: '#2f3241',
    //   symbolColor: '#74b1be',
    //   height: 60,
    // }, 
  
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: true,
    },
    autoHideMenuBar: true,
  });

  win.webContents.openDevTools();
  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
//IPC 핸들러
  //Docker 이미지
  ipcMain.handle('get-docker-images', async () => {
    try {
      const { stdout } = await execAsync('docker images --format "{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}"');
      return stdout.split('\n').filter(line => line !== '');
    } catch (error) {
      console.error('Failed to fetch Docker images:', error);
      throw error;
    }
  });
  //Docker 컨테이너
  ipcMain.handle('fetch-docker-containers', async () => {
    try {
      const { stdout } = await execAsync('docker ps --format "{{.ID}} {{.Image}} {{.Status}} {{.Ports}}"');
      return stdout.split('\n').filter(line => line !== '');
    } catch (error) {
      console.error('Failed to fetch Docker containers:', error);
      throw error;
    }
  });
 //Docker 헬스체크

// IPC 핸들러 설정
ipcMain.handle("get-inbound-rules", async () => {
  return new Promise<string>((resolve, reject) => {
    exec(
      "netsh advfirewall firewall show rule name=all",
      { encoding: "binary" }, // 인코딩을 'binary'로 설정
      (error, stdout, stderr) => {
        if (error) {
          console.error("Error executing command:", error.message);
          reject(`Error: ${error.message}`);
        } else if (stderr) {
          console.error("Stderr:", stderr);
          reject(`Stderr: ${stderr}`);
        } else {
          // CP949 인코딩을 UTF-8로 변환
          const decodedOutput = iconv.decode(
            Buffer.from(stdout, "binary"),
            "cp949"
          );
          resolve(decodedOutput);
        }
      }
    );
  });
});

ipcMain.handle("toggle-port", async (_, name: string, newEnabled: string) => {
  return new Promise<string>((resolve, reject) => {
    exec(
      `netsh advfirewall firewall set rule name="${name}" new enable=${newEnabled}`,
      (error, stdout, _) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      }
    );
  });
});


  win.on("close", (event) => {
  if (!isQuiting) {
    event.preventDefault();
    win?.hide();
  }
});

win.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);
  return { action: "deny" };
});


  //CustomBar 관련 
  ipcMain.on('minimize-window', () => {
    win?.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    win?.close();
  });




}

// Create the system tray icon and menu
function createTray() {
tray = new Tray(path.join(process.env.VITE_PUBLIC, "tray.png"));

const contextMenu = Menu.buildFromTemplate([
  {
    label: "Show App",
    click: () => {
      win?.show();
    },
  },
  {
    label: "Quit",
    click: () => {
      isQuiting = true;
      app.quit();
    },
  },
]);

tray.setToolTip("My Electron App");
tray.setContextMenu(contextMenu);

tray.on("click", () => {
  win?.show();
});
}







// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.

app.on("ready", async () => {
  await createWindow();
  createTray();
});




app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});



app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});