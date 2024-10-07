// 이미지 빌드 함수
export const handleBuildImage = async (
  contextPath: string,
  dockerfilePath: string,
  name: string,
  tag: string
): Promise<{
  success: boolean;
  image?: DockerImage;
  message?: string;
}> => {
  try {
    console.log(`Building Docker image: ${name}:${tag} from ${contextPath}`);

    const { success, image, error } = await window.electronAPI.buildDockerImage(
      contextPath,
      dockerfilePath,
      name,
      tag
    );

    console.log(`Docker build success: ${success}`);
    if (error) {
      console.log(`Docker build error: ${error}`);
    }

    return {
      success: success,
      image: image,
    };
  } catch (error) {
    console.error("Error building Docker image:", error);
    return { success: false, message: String(error) };
  }
};

// 컨테이너 생성 및 시작
export const createAndStartContainer = async (
  dockerImage: DockerImage,
  inboundPort: number,
  outboundPort: number,
  envs: EnvVar[],
  healthCheckCommand: string[]
): Promise<{
  success: boolean;
  container?: DockerContainer;
  error?: string;
}> => {
  try {
    console.log("이미지 빌드 시작.... 이미지 정보 ", dockerImage);
    // repoTag 기반 컨테이너 생성 및 시작
    const repoTag = dockerImage.RepoTags?.[0];
    if (!repoTag) {
      return {
        success: false,
        error: `No RepoTag found for image: ${dockerImage}`,
      };
    }

    const containerName = `${repoTag.replace(/[:/]/g, "-")}-container`;

    //containerOption 생성
    const containerOptions = await window.electronAPI.createContainerOptions(
      repoTag,
      containerName,
      inboundPort,
      outboundPort,
      envs,
      healthCheckCommand
    );

    //Option 기반 container 생성 및 실행
    const { success, containerId } = await window.electronAPI.createContainer(
      containerOptions
    );

    if (success && containerId) {
      const { success } = await window.electronAPI.restartContainer(
        containerId
      );

      if (success) {
        console.log("container 빌드 여부 확인", success, containerId);

        const containers = await window.electronAPI.getDockerContainers(true);
        const createdContainer = containers.find((c) => c.Id === containerId);
        console.log("container 빌드 여부 확인", success, createdContainer);
        return { success: true, container: createdContainer };
      }
    }

    if (!success) {
      return { success: false, container: undefined };
    }
  } catch (error) {
    return {
      success: false,
      error: "container 실행 실패",
    };
  }

  // 마지막 기본 반환 값 추가
  return { success: false, error: "Unexpected error" };
};
