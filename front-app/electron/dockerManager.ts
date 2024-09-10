import { ipcMain, IpcMainInvokeEvent } from "electron";
import { exec } from "child_process";
import { promisify } from "util";
import Docker from "dockerode";
import { EventEmitter } from "events";
import path from "node:path";
import * as fs from "fs";
import { Readable } from "stream";
import { getStompClient } from "src/utils/stompService";

const execAsync = promisify(exec);

// Dockerode 인스턴스 생성
export const docker = new Docker();

// 로그 스트림 객체
export const logStreams: Record<string, Readable> = {};

//------------------- 도커 상태 체크 -----------------------------
export async function checkDockerStatus(): Promise<
  "running" | "not running" | "unknown"
> {
  try {
    await execAsync("docker info");
    return "running";
  } catch {
    return "not running";
  }
}

export const handlecheckDockerStatus = (): void => {
  ipcMain.handle("check-docker-status", async () => {
    return await checkDockerStatus();
  });
};

//------------------- Docker Desktop 경로 ------------------------
export const getDockerPath = (): void => {
  ipcMain.handle("get-docker-path", async () => {
    try {
      const command =
        process.platform === "win32" ? "where docker" : "which docker";
      const { stdout } = await execAsync(command);
      const dockerPath = stdout.trim().split("\n")[0];
      if (!dockerPath) throw new Error("Docker executable not found.");
      return dockerPath;
    } catch (error) {
      console.error("Error finding Docker path:", error);
      throw error;
    }
  });
};

//------------------- Docker Desktop 실행 ------------------------
export const handleStartDocker = (): void => {
  ipcMain.handle("open-docker-desktop", async (_event, dockerPath) => {
    if (!dockerPath) {
      console.error("Docker executable path not provided.");
      throw new Error("Docker executable path not provided.");
    }

    exec(`"${dockerPath}"`, (error) => {
      if (error) {
        console.error("Error launching Docker Desktop:", error);
        throw error;
      }
      console.log("Docker Desktop launched successfully.");
    });
  });
};

//------------------- 도커 이벤트 스트림 --------------------------
export const handleGetDockerEvent = (): void => {
  ipcMain.on("get-docker-event", (event) => {
    docker.getEvents({}, (err, stream) => {
      if (err) {
        console.error("Error connecting to Docker events:", err);
        event.reply("docker-event-error", err.message);
        return;
      }

      if (stream) {
        stream.on("data", (chunk: Buffer) => {
          try {
            const dockerEvent = JSON.parse(chunk.toString());

            // 이벤트 필터링: heartbeat 또는 불필요한 이벤트 필터링
            if (
              dockerEvent.Type === "container" &&
              dockerEvent.Action !== "heartbeat"
            ) {
              event.reply("docker-event-response", dockerEvent);
            }
          } catch (parseError) {
            console.error("Error parsing Docker event:", parseError);
            event.reply("docker-event-error", parseError);
          }
        });

        stream.on("error", (error: Error) => {
          console.error("Stream Error:", error);
          event.reply("docker-event-error", error.message);
        });

        stream.on("end", () => {
          console.log("Docker events stream ended");
          event.reply("docker-event-end");
        });
      } else {
        event.reply("docker-event-error", "No stream returned");
      }
    });
  });
};

//------------------- 개별 컨테이너 stats cpu, 디스크 리딩 포함
export function getContainerStatsStream(containerId: string): EventEmitter {
  const container = docker.getContainer(containerId);
  const statsEmitter = new EventEmitter();

  // Docker 컨테이너의 stats를 스트리밍 방식으로 수신
  container.stats({ stream: true }, (err, stream) => {
    if (err) {
      console.error("Error fetching stats:", err);
      statsEmitter.emit("error", { containerId, error: err });
      return;
    }

    // 스트림에서 데이터가 들어올 때마다 이벤트 발생
    stream?.on("data", (data: Buffer) => {
      try {
        const stats = JSON.parse(data.toString());
        console.log(stats);
        // 데이터를 `data` 이벤트로 전달
        statsEmitter.emit("data", { containerId, stats });
      } catch (error) {
        console.error("Error parsing stats data:", error);
        statsEmitter.emit("error", { containerId, error });
      }
    });

    // 스트림에서 오류가 발생할 때
    stream?.on("error", (err: Error) => {
      console.error("Stream error:", err);
      statsEmitter.emit("error", { containerId, error: err });
    });

    // 스트림이 종료될 때
    stream?.on("end", () => {
      statsEmitter.emit("end", { containerId });
    });
  });

  // statsEmitter를 반환하여 외부에서 이벤트를 수신할 수 있도록 함
  return statsEmitter;
}

export function handleGetContainerStatsPeriodic() {
  ipcMain.handle(
    "get-container-stats",
    async (_event: IpcMainInvokeEvent, containerId: string) => {
      console.log(
        `Starting periodic stats monitoring for container ${containerId}`
      );

      const intervalId = setInterval(async () => {
        try {
          const container = docker.getContainer(containerId);
          const stats = await new Promise((resolve, reject) => {
            container.stats(
              { stream: false, "one-shot": true },
              (err, stats) => {
                if (err) reject(err);
                else
                  resolve({
                    cpu_usage: stats?.cpu_stats?.cpu_usage?.total_usage ?? 0, // 나노초 (nanoseconds)
                    memory_usage: stats?.memory_stats?.usage ?? 0, // 바이트 (bytes)
                    blkio_read:
                      stats?.blkio_stats?.io_service_bytes_recursive?.find(
                        (io) => io.op === "Read" // 바이트 수
                      )?.value ?? 0,
                    blkio_write:
                      stats?.blkio_stats?.io_service_bytes_recursive?.find(
                        (io) => io.op === "Write" // 바이트 수
                      )?.value ?? 0,
                    container_id: containerId,
                  });
              }
            );
          });

          console.log(`Fetched stats for container ${containerId}:`, stats);
        } catch (error) {
          console.error("Error fetching container stats:", error);
        }
      }, 60000); // 1분마다 실행

      return intervalId; // Interval ID를 반환하여 필요 시 clear할 수 있음
    }
  );
}

// export function monitorAllContainersCpuUsage(): void {
//   docker.listContainers((err, containers) => {
//     if (!containers || containers.length === 0) {
//       return;
//     }
//     if (err) {
//       console.error("Error listing containers:", err);
//       return;
//     }

//     let totalCpuUsage = 0;
//     let containerCount = containers.length;
//     const mainWindow = BrowserWindow.getAllWindows()[0]; // 첫 번째 창을 가져옴

//     containers.forEach((container) => {
//       const statsEmitter = getContainerStatsStream(container.Id);

//       statsEmitter.on(
//         "data",
//         ({ containerId, cpuUsagePercent }: CpuUsageData) => {
//           totalCpuUsage += cpuUsagePercent;
//           const averageCpuUsage = totalCpuUsage / containerCount;

//           mainWindow.webContents.send("cpu-usage-percent", {
//             containerId,
//             cpuUsagePercent,
//           });

//           mainWindow.webContents.send("average-cpu-usage", {
//             averageCpuUsage,
//           });
//         }
//       );

//       statsEmitter.on("error", ({ containerId, error }) => {
//         console.error(`Error in container ${containerId}:`, error);
//       });

//       statsEmitter.on("end", ({ containerId }) => {
//         console.log(`Monitoring ended for container ${containerId}`);
//         containerCount--;
//         // 종료된 컨테이너의 CPU 사용률을 총합에서 제거
//         // totalCpuUsage -= 해당 컨테이너의 cpuUsagePercent;
//       });
//     });
//   });
// }

// Docker 컨테이너 CPU 사용량 모니터링 핸들러
export const handleMonitorContainersCpuUsage = (): void => {
  ipcMain.handle("monitor-single-container", (event, containerId: string) => {
    const statsEmitter = getContainerStatsStream(containerId);

    // statsEmitter에서 'data' 이벤트 발생 시 IPC를 통해 클라이언트에 전달
    statsEmitter.on("data", (data) => {
      console.log(`Container ID: ${data.containerId}, Stats:`, data.stats);
      event.sender.send("container-stats", data);
    });

    // statsEmitter에서 'error' 이벤트 발생 시 IPC를 통해 클라이언트에 전달
    statsEmitter.on("error", (error) => {
      console.error(`Error for container ${error.containerId}:`, error.error);
      event.sender.send("container-error", error);
    });

    // statsEmitter에서 'end' 이벤트 발생 시 IPC를 통해 클라이언트에 전달
    statsEmitter.on("end", (data) => {
      console.log(`Monitoring ended for container ${data.containerId}`);
      event.sender.send("container-end", data);
    });
  });
};

//----------Docker 이미지 및 컨테이너 Fetch

//단일이미지[이미지 파일있음]
export const handleFetchDockerImages = (): void => {
  ipcMain.handle("fetch-docker-image", async (_event, imageId: string) => {
    try {
      const image = await docker.getImage(imageId).inspect();
      return image;
    } catch (err) {
      console.error(`Failed to fetch Docker image ${imageId}:`, err);
      throw err;
    }
  });
};

//단일 컨테이너[컨테이너 파일 있음]
export const handleFetchDockerContainer = (): void => {
  ipcMain.handle(
    "fetch-docker-container",
    async (_event, containerId: string) => {
      try {
        const container = await docker.getContainer(containerId).inspect();
        return container;
      } catch (err) {
        console.error(`Failed to fetch Docker container ${containerId}:`, err);
        throw err;
      }
    }
  );
};

//이미지리스트[실제 실행중인 전체목록]
export const handleFetchDockerImageList = (): void => {
  ipcMain.handle("get-all-docker-images", async () => {
    try {
      const images = await docker.listImages({ all: true });
      return images;
    } catch (err) {
      console.error("Failed to fetch Docker images:", err);
      throw err;
    }
  });
};

//컨테이너리스트[실제 실행중인 전체목록]
export const handleFetchDockerContainerList = (all: boolean = false): void => {
  ipcMain.handle("get-all-docker-containers", async () => {
    try {
      const containers = await docker.listContainers({ all, size: true });
      return containers;
    } catch (err) {
      console.error("Failed to fetch Docker containers:", err);
      throw err;
    }
  });
};

// Docker 컨테이너 로그 스트리밍
export const handleFetchContainerLogs = (): void => {
  ipcMain.on(
    "start-container-log-stream",
    async (event, containerId: string) => {
      try {
        const container = docker.getContainer(containerId);
        const logStream = (await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          since: 0,
          timestamps: true,
        })) as Readable;

        logStreams[containerId] = logStream;

        logStream.on("data", (chunk: Buffer) => {
          event.sender.send("container-logs-stream", chunk.toString());
        });

        logStream.on("error", (err: Error) => {
          event.sender.send("container-logs-error", err.message);
        });

        logStream.on("end", () => {
          event.sender.send("container-logs-end");
        });
      } catch (err) {
        event.sender.send(
          "container-logs-error",
          (err as Error).message || "Unknown error"
        );
      }
    }
  );
};

ipcMain.on("stop-container-log-stream", (event, containerId: string) => {
  const logStream = logStreams[containerId];
  if (logStream) {
    logStream.destroy();
    delete logStreams[containerId];
    event.sender.send(
      "container-logs-end",
      `Log stream for container ${containerId} has been stopped.`
    );
  } else {
    event.sender.send(
      "container-logs-error",
      `No active log stream for container ${containerId}.`
    );
  }
});

//------------------- Docker 이미지 생성

//도커파일 찾기
export function findDockerfile(directory: string): string | null {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const result = findDockerfile(fullPath);
      if (result) {
        return result;
      }
    } else if (file === "Dockerfile") {
      return fullPath;
    }
  }

  return null;
}

export function handleFindDockerFile() {
  ipcMain.handle("find-dockerfile", async (_, directory: string) => {
    try {
      const dockerfilePath = findDockerfile(directory);
      return dockerfilePath;
    } catch (error) {
      console.error("Error finding Dockerfile:", error);
      return null;
    }
  });
}
export async function buildDockerImage(
  contextPath: string,
  dockerfilePath: string,
  imageName: string,
  tag: string
): Promise<{
  status: "success" | "exists" | "failed";
  image?: DockerImage;
}> {
  const fullTag = `${imageName}:${tag}`;

  const dockerImages = await docker.listImages();
  const imageInDocker = dockerImages.find((img) =>
    img.RepoTags?.includes(fullTag)
  );

  //이미 목록에 있는 경우
  if (imageInDocker) {
    console.log(`Image ${fullTag} already exists. delete and rebuild`);
    const imageInspect = await docker.getImage(fullTag).inspect();
    return { status: "exists", image: imageInspect };
  }

  const dockerfileRelativePath = path.basename(dockerfilePath);
  // console.log("1111.Context Path:", contextPath);
  // console.log("2222.Dockerfile Relative Path:", dockerfileRelativePath);
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    docker.buildImage(
      { context: contextPath, src: [dockerfileRelativePath] },
      { t: fullTag },
      (err, stream) => {
        if (err) {
          reject(err);
        } else if (stream) {
          resolve(stream);
        } else {
          reject(new Error("Stream is undefined"));
        }
      }
    );
  });

  stream.pipe(process.stdout, { end: true });

  return new Promise<{
    status: "success" | "exists" | "failed";
    image?: DockerImage;
  }>((resolve, reject) => {
    stream.on("end", async () => {
      console.log(`Docker image ${fullTag} built successfully`);

      try {
        const builtImage = await docker.getImage(fullTag).inspect();
        resolve({ status: "success", image: builtImage });
      } catch (error) {
        console.error("Error inspecting built image:", error);
        reject({ status: "failed" });
      }
    });

    stream.on("error", (err: Error) => {
      console.error("Error building Docker image:", err);
      reject({ status: "failed" });
    });
  });
}

// 파일 경로 기반으로 이미지 빌드
export async function processAndBuildImage(
  contextPath: string,
  dockerfilePath: string,
  imageName: string,
  tag: string
): Promise<{
  status: "success" | "exists" | "failed";
  image?: DockerImage;
}> {
  if (dockerfilePath) {
    console.log(`Dockerfile found at: ${dockerfilePath}`);
    try {
      const buildStatus = await buildDockerImage(
        contextPath,
        dockerfilePath,
        imageName,
        tag
      );
      console.log(`Docker image build status: ${buildStatus.status}`);
      return buildStatus; // ImageInspectInfo 타입의 이미지 정보 반환
    } catch (error) {
      console.error("Failed to build Docker image:", error);
      return { status: "failed" };
    }
  } else {
    console.error("Dockerfile not found.");
    return { status: "failed" };
  }
}

//이미지 삭제
export const removeImage = async (
  imageId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const image = docker.getImage(imageId);
    await image.remove();
    console.log(`Image ${imageId} removed successfully`);
    return { success: true };
  } catch (error) {
    console.error(`Error removing image ${imageId}:`, error);
    return { success: false, error: (error as Error).message };
  }
};

// 이미지 IPC 핸들러
export function handleBuildDockerImage() {
  ipcMain.handle(
    "build-docker-image",
    async (
      _event,
      contextPath: string,
      dockerfilePath: string,
      imageName: string = "my-docker-image",
      tag: string = "latest"
    ) => {
      console.log(
        `Received request to build Docker image from path: ${contextPath}`
      );
      try {
        // 이미지 빌드 및 결과 반환
        const buildResult = await processAndBuildImage(
          contextPath,
          dockerfilePath,
          imageName,
          tag
        );
        console.log(buildResult.status);
        return { success: true, image: buildResult.image };
      } catch (error) {
        console.error("Error processing Docker image:", error);
        // 실패 시 오류 메시지 반환
        return { success: false, message: (error as Error).message };
      }
    }
  );

  ipcMain.handle("remove-image", async (_event, imageId: string) => {
    return removeImage(imageId);
  });
}

//--------Docker 컨테이너 생성/실행/정지/삭제

// Docker 컨테이너 옵션 설정 함수
export const createContainerOptions = (
  name: string,
  containerName: string,
  inboundPort: number = 80,
  outboundPort: number = 8080
): ContainerCreateOptions => {
  return {
    Image: name,
    name: containerName,
    ExposedPorts: inboundPort
      ? {
          [`${inboundPort}/tcp`]: {},
        }
      : {},
    HostConfig: {
      PortBindings:
        inboundPort && outboundPort
          ? {
              [`${inboundPort}/tcp`]: [{ HostPort: outboundPort + "" }],
            }
          : {},
    },
    Healthcheck: {
      Test: ["CMD-SHELL", "curl -f http://localhost/ || exit 1"],
      Interval: 30000000000, // 30초 (나노초 단위)
      Timeout: 10000000000, // 10초 (나노초 단위)
      Retries: 3, // 실패 시 재시도 횟수
      StartPeriod: 5000000000, // 컨테이너 시작 후 처음 HealthCheck를 수행하기 전 대기 시간 (5초)
    },
  };
};

export const createContainer = async (
  options: ContainerCreateOptions
): Promise<{ success: boolean; containerId?: string; error?: string }> => {
  try {
    // 동일한 이름의 컨테이너가 이미 있는지 확인
    const existingContainers = await docker.listContainers({ all: true });
    const existingContainer = existingContainers.find((container) =>
      container.Names.includes(`/${options.name}`)
    );

    if (existingContainer) {
      console.log(
        `Container with name ${options.name} already exists with ID ${existingContainer.Id}.`
      );
      return {
        success: true,
        containerId: existingContainer.Id,
        error: "Container with this name already exists",
      };
    }

    // 새로운 컨테이너 생성
    const container = await docker.createContainer(options);
    console.log(`Container ${container.id} created successfully`);
    return { success: true, containerId: container.id };
  } catch (error) {
    console.error("Error creating container:", error);
    return { success: false, error: (error as Error).message };
  }
};

//컨테이너 실행
// export const startContainer = async (
//   containerId: string
// ): Promise<{ success: boolean; error?: string }> => {
//   try {
//     const container = docker.getContainer(containerId);
//     await container.start();
//     console.log(`Container ${containerId} started successfully`);
//     return { success: true };
//   } catch (error) {
//     console.error(`Error starting container ${containerId}:`, error);
//     return { success: false, error: (error as Error).message };
//   }
// };

export const startContainer = async (
  containerId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const container = docker.getContainer(containerId);
    const containerInfo = await container.inspect();

    // 컨테이너가 존재하고 실행 중이 아닌 경우에만 시작
    if (containerInfo.State && containerInfo.State.Status !== "running") {
      await container.start();
      console.log(`Container ${containerId} started successfully`);
      return { success: true };
    } else if (containerInfo.State.Status === "running") {
      console.log(`Container ${containerId} is already running`);
      return { success: true };
    } else {
      console.error(
        `Container ${containerId} is not in a state that can be started`
      );
      return { success: false, error: "Container is not in a startable state" };
    }
  } catch (error) {
    console.error(`Error starting container ${containerId}:`, error);
    return { success: false, error: (error as Error).message };
  }
};

// 컨테이너 정지
export const stopContainer = async (containerId: string): Promise<void> => {
  try {
    const container = docker.getContainer(containerId);
    await container.stop();
    console.log(`Container ${containerId} stopped successfully`);
  } catch (err) {
    console.error(`Error stopping container ${containerId}:`, err);
  }
};

// 컨테이너 삭제 함수
export const removeContainer = async (
  containerId: string,
  options?: ContainerRemoveOptions
): Promise<void> => {
  try {
    const container = docker.getContainer(containerId);
    await container.remove(options);
    console.log(`Container ${containerId} removed successfully`);
  } catch (err) {
    console.error(`Error removing container ${containerId}:`, err);
  }
};

//Container Ipc Handler
export function registerContainerIpcHandlers() {
  ipcMain.handle(
    "create-container-options",
    async (
      _event,
      repoTag: string,
      containerName: string,
      inboundPort?: number,
      outboundPort?: number
    ) => {
      try {
        return createContainerOptions(
          repoTag,
          containerName,
          inboundPort,
          outboundPort
        );
      } catch (error) {
        console.error(`Error creating container options:`, error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    "create-container",
    async (_event, options: ContainerCreateOptions) => {
      return createContainer(options);
    }
  );

  ipcMain.handle("start-container", async (_event, containerId: string) => {
    return startContainer(containerId);
  });

  //생성 및 시작
  ipcMain.handle(
    "create-and-start-container",
    async (_event, containerOptions: ContainerCreateOptions) => {
      try {
        // 컨테이너 생성
        const result = await createContainer(containerOptions);

        if (result.success && result.containerId) {
          // 컨테이너 실행
          const startResult = await startContainer(result.containerId);
          if (startResult.success) {
            return { success: true, containerId: result.containerId };
          } else {
            throw new Error(startResult.error);
          }
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        console.error("Error during container creation and start:", error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  ipcMain.handle("stop-container", async (_event, containerId: string) => {
    try {
      await stopContainer(containerId);
      return { success: true };
    } catch (err) {
      console.error(`Error stopping container ${containerId}:`, err);
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(
    "remove-container",
    async (_event, containerId: string, options?: ContainerRemoveOptions) => {
      try {
        await removeContainer(containerId, options);
        return { success: true };
      } catch (err) {
        console.error(`Error removing container ${containerId}:`, err);
        return { success: false, error: (err as Error).message };
      }
    }
  );
}
