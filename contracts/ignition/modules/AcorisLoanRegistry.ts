import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("AcorisLoanRegistryModule", (m) => {
  const registry = m.contract("AcorisLoanRegistry");
  return { registry };
});
