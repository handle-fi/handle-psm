import { task } from "hardhat/config";
import { getLedgerSigner } from "../utils";
import contracts from "../../contracts.json";

task("hpsm-set-fee")
  .addParam("feepercent")
  .addOptionalParam("ledgersigner")
  .setAction(async (args, hre) => {
    const { HPSM__factory } = require("../../build/typechain");
    let signer;
    if (!args.ledgersigner) {
      signer = (await hre.ethers.getSigners())[0];
    } else {
      signer = getLedgerSigner(args.ledgersigner, hre.ethers.provider);
    }
    const network = hre.network.name;
    const hPSM = HPSM__factory
      .connect(contracts[network].hpsm, signer);
    const fee = hre.ethers.utils.parseEther(
      (parseFloat(args.feepercent)/100).toString()
    );
    const value = `${parseFloat(hre.ethers.utils.formatEther(fee))*100}%`;
    console.log(`setting fee to ${value}...`);
    const tx = await hPSM.setTransactionFee(fee);
    await tx.wait(1);
    console.log("...done");
  });

task("hpsm-collateral-cap")
  .addParam("pegtoken")
  .addParam("amount")
  .addParam("decimals")
  .addOptionalParam("ledgersigner")
  .setAction(async (args, hre) => {
    const { HPSM__factory } = require("../../build/typechain");
    let signer;
    if (!args.ledgersigner) {
      signer = (await hre.ethers.getSigners())[0];
    } else {
      signer = getLedgerSigner(args.ledgersigner, hre.ethers.provider);
    }
    const network = hre.network.name;
    const hPSM = HPSM__factory
      .connect(contracts[network].hpsm, signer);
    if (!(parseInt(args.decimals) < 255 && parseInt(args.decimals) >= 0)) {
      throw new Error("Decimals must be a positive integer less than 255");
    }
    const amount = hre.ethers.utils.parseUnits(
      args.amount,
      parseInt(args.decimals)
    );
    console.log(`setting cap of ${args.pegtoken} to ${hre.ethers.utils.formatUnits(
      amount,
      parseInt(args.decimals)
    )}...`);
    const tx = await hPSM.setCollateralCap(args.pegtoken, amount);
    await tx.wait(1);
    console.log("...done");
  });

task("hpsm-set-peg")
  .addParam("fxtoken")
  .addParam("pegtoken")
  .addOptionalParam("ledgersigner")
  .setAction(async (args, hre) => {
    const { FxToken__factory, HPSM__factory } = require("../../build/typechain");
    let signer;
    if (!args.ledgersigner) {
      signer = (await hre.ethers.getSigners())[0];
    } else {
      signer = getLedgerSigner(args.ledgersigner, hre.ethers.provider);
    }
    const network = hre.network.name;
    const hPSM = HPSM__factory
      .connect(contracts[network].hpsm, signer);
    console.log(`address: ${hPSM.address}`);
    const fxToken = FxToken__factory
      .connect(args.fxtoken, signer);
    const operatorRole = await fxToken.OPERATOR_ROLE();
    if (!await fxToken.hasRole(operatorRole, hPSM.address)) {
      console.log("hPSM is not operator of fxToken, granting role now...");
      await (await fxToken.grantRole(operatorRole, hPSM.address)).wait(1);
      console.log("...done");
    } else {
      console.log("hPSM is already operator of fxToken");
    }
    const tx = await hPSM
      .setFxTokenPeg(fxToken.address, args.pegtoken, true);
    console.log("awaiting for confirmation...");
    await tx.wait(1);
    console.log("...done");
  });
