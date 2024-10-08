import React from "react";
import CpuStatusItem from "../features/home/CpuStatusItem";
import PaymentStatusItem from "../features/home/PaymentStatusItem";
import {
  DeployContainerInfo,
  useContainerStore,
} from "../stores/containerStore";

const Home: React.FC = () => {
  const containers = useContainerStore((state) => state.containers);

  const getUrl = (deployment: DeployContainerInfo) => {
    let subdomain = deployment.subdomainName;
    if (deployment.serviceType === "DATABASE") {
      subdomain = deployment.containerName;
      return `database_${subdomain}`;
    }
    return `http://${subdomain}.ttalkak.com`;
  };

  const tableBody = "py-2 px-4 text-sm text-gray-900 align-middle";

  return (
    <div className="h-full flex flex-col">
      <div className="flex">
        <CpuStatusItem />
        <PaymentStatusItem />
      </div>

      <div className="card w-full h-full mt-2.5 flex flex-col">
        {Object.keys(containers).length === 0 ? (
          <div className="text-center text-gray-700 py-10">
            현재 배포중인 서비스가 없습니다.
          </div>
        ) : (
          <div className="flex flex-col flex-grow overflow-hidden rounded-lg custom-scrollbar">
            <table className="min-w-full divide-y divide-gray-300">
              <thead className="sticky z-10 top-0 text-sm bg-white-gradient border-b">
                <tr>
                  <th className="p-1 ">ServiceId</th>
                  <th className="p-1 ">Name</th>
                  <th className="p-1 text-left">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white overflow-y-auto">
                {Object.entries(containers).map(([containerId, deployment]) => (
                  <tr key={containerId} className="hover:bg-gray-50">
                    <td className={`${tableBody} min-w-32`}>{deployment.id}</td>
                    <td className={`${tableBody} min-w-32`}>
                      {deployment.subdomainName || deployment.containerName}
                    </td>
                    <td className={`${tableBody} min-w-md break-words`}>
                      <a
                        href={`${getUrl(deployment)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className=" hover:text-blue-600"
                      >
                        {getUrl(deployment)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
