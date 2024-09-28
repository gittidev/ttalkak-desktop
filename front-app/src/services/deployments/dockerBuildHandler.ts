import { useDockerStore } from "../../stores/appStatusStore.tsx";
import { useDeploymentStore } from "../../stores/deploymentStore.tsx";
import { useDeploymentDetailsStore } from "../../stores/deploymentDetailsStore.tsx";
import { createAndStartContainer, handleBuildImage } from "./dockerUtils.ts";
import { sendInstanceUpdate } from "../websocket/sendUpdateUtils";
import { startContainerStatsMonitoring } from "../monitoring/healthCheckPingUtils";
import { startPgrok } from "./pgrokHandler.ts";

// 상수 정의
const DEFAULT_INBOUND_PORT = 80;
const DEFAULT_OUTBOUND_PORT = 8080;

// 공통 유틸 함수: Docker 이미지 및 컨테이너 생성 로직
export async function handleDockerBuild(compute: DeploymentCommand) {
  const { success, dockerfilePath, contextPath } =
    await window.electronAPI.downloadAndUnzip(
      compute.sourceCodeLink,
      compute.dockerRootDirectory,
      compute.dockerFileScript,
      compute.envs
    );

  if (success) {
    const { image } = await handleBuildImage(
      contextPath,
      dockerfilePath,
      compute.subdomainName
    );
    if (image) {
      // 도커 이미지 추가
      useDockerStore.getState().addDockerImage(image);
      const containerId = await createAndStartContainer(
        image,
        compute.inboundPort || DEFAULT_INBOUND_PORT,
        compute.outboundPort || DEFAULT_OUTBOUND_PORT
      );

      // 배포 및 컨테이너 상태 업데이트
      sendInstanceUpdate(
        compute.deploymentId,
        "RUNNING",
        compute.outboundPort,
        ""
      );

      useDeploymentStore
        .getState()
        .addDeployment(compute.deploymentId, containerId);
      useDeploymentDetailsStore
        .getState()
        .setRepoUrl(compute.deploymentId, compute.sourceCodeLink);
      useDeploymentDetailsStore
        .getState()
        .setDeploymentDetails(compute.deploymentId, compute);

      // 컨테이너 상태 및 로그 모니터링 시작
      window.electronAPI.startContainerStats([containerId]);
      window.electronAPI.startLogStream(containerId);
      startContainerStatsMonitoring();
      await startPgrok(compute);
    }
  } else {
    sendInstanceUpdate(
      compute.deploymentId,
      "DOCKER_FILE_ERROR",
      compute.outboundPort,
      ""
    );
  }
}
