import { ethers } from "ethers";

export const getEventData = <TEvent>(
  eventName: string,
  contract: ethers.Contract,
  txResult: ethers.ContractReceipt
): TEvent => {
  if (!Array.isArray(txResult.logs)) return null;
  for (let log of txResult.logs) {
    try {
      const decoded = contract.interface.parseLog(log);
      if (decoded.name === eventName)
        return {
          ...decoded,
          ...decoded.args
        } as unknown as TEvent;
    } catch (error) {}
  }
  return null;
};
