import { ethers as tsEthers } from "ethers";
import * as hPSM from "./hPSM";
import * as hPSM2 from "./hPSM2";

export interface DeploymentModule {
  contractNames: (...params: any) => string[];
  constructorArguments: (addresses?: any) => any[];
  deploy: (
    deployer: tsEthers.Signer,
    setAddresses: Function,
    addresses?: any
  ) => Promise<tsEthers.Contract>;
  upgrade?: (deployer: tsEthers.Signer, addresses?: any) => void;
}

const modules: DeploymentModule[] = [hPSM, hPSM2];

export default modules;
