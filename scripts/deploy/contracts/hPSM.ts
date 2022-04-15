import { deployContract } from "../utils";
import {HPSM} from "../../../build/typechain";

export const contractNames = () => ["hpsm"];

export const constructorArguments = () => [];

export const deploy = async (deployer, setAddresses) => {
  console.log("deploying hPSM");
  const hPSM: HPSM = await deployContract(
    "hPSM",
    constructorArguments(),
    deployer,
    1
  ) as HPSM;
  console.log(`deployed hPSM to address ${hPSM.address}`);
  setAddresses({ hPSM: hPSM.address });
  return hPSM;
};
