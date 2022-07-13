import { deployContract } from "../utils";
import {HPSM2} from "../../../build/typechain";

export const contractNames = () => ["hpsm2"];

export const constructorArguments = () => [];

export const deploy = async (deployer, setAddresses) => {
  console.log("deploying hPSM2");
  const hPSM2: HPSM2 = await deployContract(
    "hPSM2",
    constructorArguments(),
    deployer,
    1
  ) as HPSM2;
  console.log(`deployed hPSM2 to address ${hPSM2.address}`);
  setAddresses({ hpsm2: hPSM2.address });
  return hPSM2;
};
