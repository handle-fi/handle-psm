import { ethers } from "hardhat";
import { Signer, BigNumber, Wallet } from "ethers";
import { expect } from "chai";
import { getEventData } from "./utils";
import {
  FxToken,
  FxToken__factory,
  Handle,
  Handle__factory,
  HPSM, HPSM__factory, MockToken__factory
} from "../build/typechain";
import exp from "constants";

let handle: Handle;
let fxUSD: FxToken;
let usdc: FxToken;
let psm: HPSM;
let deployer: Signer;
let user: Wallet;

const ERROR_NOT_PEGGED = "PSM: fxToken not pegged to peggedToken";

describe("hPSM", () => {
  before(async () => {
    deployer = (await ethers.getSigners())[0];
    user = new ethers.Wallet(
      "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef",
      deployer.provider
    );
    // Send ETH to user from signer.
    await deployer.sendTransaction({
      to: user.address,
      value: ethers.utils.parseEther("1000")
    });
    handle = await new Handle__factory(deployer).deploy()
    fxUSD = await new FxToken__factory(deployer)
      .deploy("handle USD", "fxUSD");
    usdc = await new MockToken__factory(deployer)
      .deploy("USD Coin", "USDC", 6);
    psm = await new HPSM__factory(deployer)
      .deploy(handle.address);
  });
  it("Should not allow depositing for non-fxTokens", async () => {
    await expect(
      psm.connect(user).deposit(
        fxUSD.address,
        usdc.address,
        ethers.utils.parseUnits("1", 6)
     )
    ).to.be.revertedWith(ERROR_NOT_PEGGED);
  });
  it("Should not allow pegging for a non-fxToken", async () => {
    // This will not work because fxUSD was not set as a fxToken in
    // the mock Handle contract yet.
    expect(
      psm.setFxTokenPeg(
        fxUSD.address,
        usdc.address,
        true
      )
    ).to.be.revertedWith("PSM: not a valid fxToken");
  });
  it("Should peg USDC to fxUSD", async () => {
    // Make fxUSD a fxToken in the mock contract.
    await handle.setFxToken(fxUSD.address);
    // Make PSM an fxToken operator.
    await fxUSD.grantRole(
      await fxUSD.OPERATOR_ROLE(),
      psm.address,
    );
    // Try setting the peg.
    const receipt = await (await psm.setFxTokenPeg(
      fxUSD.address,
      usdc.address,
      true
    )).wait();
    const event: {
      fxToken: string,
      peggedToken: string,
      isPegged: boolean,
    } = getEventData("SetFxTokenPeg", psm, receipt);
    expect(event.fxToken).to.equal(fxUSD.address);
    expect(event.peggedToken).to.equal(usdc.address);
    expect(event.isPegged).to.be.true;
  });
  it("Should deposit 1 USDC for 1 fxUSD", async () => {
    await usdc.mint(user.address, ethers.utils.parseUnits("1", 6));
    await usdc.connect(user).approve(psm.address, ethers.constants.MaxUint256);
    const receipt = await (await psm.connect(user).deposit(
      fxUSD.address,
      usdc.address,
      ethers.utils.parseUnits("1", 6)
    )).wait();
    const event: {
      fxToken: string,
      peggedToken: string,
      account: string,
      amountIn: BigNumber,
      amountOut: BigNumber,
    } = getEventData("Deposit", psm, receipt);
    expect(event.fxToken).to.equal(fxUSD.address);
    expect(event.peggedToken).to.equal(usdc.address);
    expect(event.account).to.equal(await user.getAddress());
    expect(event.amountIn).to.equal(ethers.utils.parseUnits("1", 6));
    expect(event.amountOut).to.equal(ethers.utils.parseUnits("1", 18));
    expect(await fxUSD.balanceOf(await user.getAddress())).to.equal(
      ethers.utils.parseUnits("1", 18)
    );
  });
});
