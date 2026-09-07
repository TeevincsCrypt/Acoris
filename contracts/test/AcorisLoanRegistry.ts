import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const DAY = 24 * 60 * 60;

function loanHashFor(label: string) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

describe("AcorisLoanRegistry", function () {
  async function deployAndParties() {
    const [, borrower, lender, other] = await ethers.getSigners();
    const registry = await ethers.deployContract("AcorisLoanRegistry");
    return { registry, borrower, lender, other };
  }

  describe("proposeAgreement", function () {
    it("records the agreement and escrows collateral", async function () {
      const { registry, borrower, lender } = await deployAndParties();
      const id = loanHashFor("propose-basic");
      const principal = ethers.parseEther("10");
      const collateral = ethers.parseEther("17");

      await expect(
        registry.connect(borrower).proposeAgreement(id, lender.address, principal, 900, 30 * DAY, { value: collateral }),
      )
        .to.emit(registry, "AgreementProposed")
        .withArgs(id, borrower.address, lender.address, principal, collateral, 900, 30 * DAY);

      const agreement = await registry.agreements(id);
      expect(agreement.borrower).to.equal(borrower.address);
      expect(agreement.lender).to.equal(lender.address);
      expect(agreement.principal).to.equal(principal);
      expect(agreement.collateral).to.equal(collateral);
      expect(agreement.status).to.equal(1n); // Proposed
    });

    it("actually holds the collateral in the contract balance", async function () {
      const { registry, borrower, lender } = await deployAndParties();
      const id = loanHashFor("propose-balance");
      const collateral = ethers.parseEther("5");

      await registry.connect(borrower).proposeAgreement(id, lender.address, ethers.parseEther("3"), 500, 10 * DAY, {
        value: collateral,
      });

      expect(await ethers.provider.getBalance(await registry.getAddress())).to.equal(collateral);
    });

    it("rejects a duplicate loanHash", async function () {
      const { registry, borrower, lender } = await deployAndParties();
      const id = loanHashFor("propose-dup");
      await registry.connect(borrower).proposeAgreement(id, lender.address, 1000n, 500, DAY, { value: 100n });

      await expect(
        registry.connect(borrower).proposeAgreement(id, lender.address, 1000n, 500, DAY, { value: 100n }),
      ).to.be.revertedWithCustomError(registry, "AgreementAlreadyExists");
    });

    it("rejects zero collateral", async function () {
      const { registry, borrower, lender } = await deployAndParties();
      await expect(
        registry.connect(borrower).proposeAgreement(loanHashFor("zero-collateral"), lender.address, 1000n, 500, DAY, {
          value: 0,
        }),
      ).to.be.revertedWithCustomError(registry, "ZeroAmount");
    });

    it("rejects a zero-address lender", async function () {
      const { registry, borrower } = await deployAndParties();
      await expect(
        registry
          .connect(borrower)
          .proposeAgreement(loanHashFor("zero-lender"), ethers.ZeroAddress, 1000n, 500, DAY, { value: 100n }),
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });
  });

  describe("fundAgreement", function () {
    async function proposed() {
      const ctx = await deployAndParties();
      const id = loanHashFor("fund-" + Math.random());
      const principal = ethers.parseEther("10");
      const collateral = ethers.parseEther("17");
      await ctx.registry
        .connect(ctx.borrower)
        .proposeAgreement(id, ctx.lender.address, principal, 900, 30 * DAY, { value: collateral });
      return { ...ctx, id, principal, collateral };
    }

    it("only the named lender can fund", async function () {
      const { registry, other, id, principal } = await proposed();
      await expect(registry.connect(other).fundAgreement(id, { value: principal })).to.be.revertedWithCustomError(
        registry,
        "NotLender",
      );
    });

    it("requires msg.value to exactly equal the principal", async function () {
      const { registry, lender, id, principal } = await proposed();
      await expect(
        registry.connect(lender).fundAgreement(id, { value: principal - 1n }),
      ).to.be.revertedWithCustomError(registry, "IncorrectValue");
    });

    it("forwards the principal to the borrower and flips status to Funded", async function () {
      const { registry, borrower, lender, id, principal } = await proposed();
      const borrowerBalanceBefore = await ethers.provider.getBalance(borrower.address);

      await expect(registry.connect(lender).fundAgreement(id, { value: principal }))
        .to.emit(registry, "FundLoan")
        .withArgs(id, lender.address, borrower.address, principal);

      const borrowerBalanceAfter = await ethers.provider.getBalance(borrower.address);
      expect(borrowerBalanceAfter - borrowerBalanceBefore).to.equal(principal);

      const agreement = await registry.agreements(id);
      expect(agreement.status).to.equal(2n); // Funded
      expect(agreement.fundedAt).to.be.greaterThan(0n);
    });

    it("cannot be funded twice", async function () {
      const { registry, lender, id, principal } = await proposed();
      await registry.connect(lender).fundAgreement(id, { value: principal });
      await expect(registry.connect(lender).fundAgreement(id, { value: principal })).to.be.revertedWithCustomError(
        registry,
        "WrongStatus",
      );
    });
  });

  describe("repay", function () {
    async function funded() {
      const ctx = await deployAndParties();
      const id = loanHashFor("repay-" + Math.random());
      const principal = ethers.parseEther("10");
      const collateral = ethers.parseEther("17");
      const aprBps = 900; // 9%
      const durationSeconds = 30 * DAY;
      await ctx.registry
        .connect(ctx.borrower)
        .proposeAgreement(id, ctx.lender.address, principal, aprBps, durationSeconds, { value: collateral });
      await ctx.registry.connect(ctx.lender).fundAgreement(id, { value: principal });
      return { ...ctx, id, principal, collateral, aprBps, durationSeconds };
    }

    it("computes simple interest correctly", async function () {
      const { registry, id, principal, aprBps, durationSeconds } = await funded();
      const owed = await registry.repaymentAmount(id);
      const expectedInterest = (principal * BigInt(aprBps) * BigInt(durationSeconds)) / (BigInt(365 * DAY) * 10000n);
      expect(owed).to.equal(principal + expectedInterest);
    });

    it("only the borrower can repay", async function () {
      const { registry, other, id } = await funded();
      const owed = await registry.repaymentAmount(id);
      await expect(registry.connect(other).repay(id, { value: owed })).to.be.revertedWithCustomError(
        registry,
        "NotBorrower",
      );
    });

    it("requires msg.value to exactly match the owed amount", async function () {
      const { registry, borrower, id } = await funded();
      const owed = await registry.repaymentAmount(id);
      await expect(registry.connect(borrower).repay(id, { value: owed - 1n })).to.be.revertedWithCustomError(
        registry,
        "IncorrectValue",
      );
    });

    it("pays the lender, returns collateral to the borrower, and emits RepayLoan", async function () {
      const { registry, borrower, lender, id, collateral } = await funded();
      const owed = await registry.repaymentAmount(id);

      const lenderBefore = await ethers.provider.getBalance(lender.address);
      const borrowerBefore = await ethers.provider.getBalance(borrower.address);

      const tx = await registry.connect(borrower).repay(id, { value: owed });
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;

      await expect(tx).to.emit(registry, "RepayLoan").withArgs(id, lender.address, borrower.address, owed);

      const lenderAfter = await ethers.provider.getBalance(lender.address);
      const borrowerAfter = await ethers.provider.getBalance(borrower.address);

      expect(lenderAfter - lenderBefore).to.equal(owed);
      // Borrower paid `owed` and gas, and got `collateral` back.
      expect(borrowerAfter - borrowerBefore).to.equal(collateral - owed - gasCost);

      const agreement = await registry.agreements(id);
      expect(agreement.status).to.equal(3n); // Repaid
      expect(agreement.collateral).to.equal(0n);

      expect(await ethers.provider.getBalance(await registry.getAddress())).to.equal(0n);
    });

    it("cannot be repaid twice", async function () {
      const { registry, borrower, id } = await funded();
      const owed = await registry.repaymentAmount(id);
      await registry.connect(borrower).repay(id, { value: owed });
      await expect(registry.connect(borrower).repay(id, { value: owed })).to.be.revertedWithCustomError(
        registry,
        "WrongStatus",
      );
    });
  });

  describe("cancelProposal", function () {
    it("refunds collateral to the borrower before funding", async function () {
      const { registry, borrower, lender } = await deployAndParties();
      const id = loanHashFor("cancel-basic");
      const collateral = ethers.parseEther("5");
      await registry.connect(borrower).proposeAgreement(id, lender.address, ethers.parseEther("3"), 500, 10 * DAY, {
        value: collateral,
      });

      const before = await ethers.provider.getBalance(borrower.address);
      const tx = await registry.connect(borrower).cancelProposal(id);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const after = await ethers.provider.getBalance(borrower.address);

      expect(after - before).to.equal(collateral - gasCost);
      expect((await registry.agreements(id)).status).to.equal(5n); // Cancelled
    });

    it("cannot be cancelled by anyone other than the borrower", async function () {
      const { registry, borrower, lender, other } = await deployAndParties();
      const id = loanHashFor("cancel-wrong-caller");
      await registry.connect(borrower).proposeAgreement(id, lender.address, 1000n, 500, DAY, { value: 100n });

      await expect(registry.connect(other).cancelProposal(id)).to.be.revertedWithCustomError(registry, "NotBorrower");
    });

    it("cannot cancel a funded agreement", async function () {
      const { registry, borrower, lender } = await deployAndParties();
      const id = loanHashFor("cancel-after-funded");
      const principal = 1000n;
      await registry.connect(borrower).proposeAgreement(id, lender.address, principal, 500, DAY, { value: 100n });
      await registry.connect(lender).fundAgreement(id, { value: principal });

      await expect(registry.connect(borrower).cancelProposal(id)).to.be.revertedWithCustomError(
        registry,
        "WrongStatus",
      );
    });
  });

  describe("markDefaulted", function () {
    it("only the lender can call it", async function () {
      const { registry, borrower, lender, other } = await deployAndParties();
      const id = loanHashFor("default-wrong-caller");
      const principal = 1000n;
      await registry.connect(borrower).proposeAgreement(id, lender.address, principal, 500, DAY, { value: 100n });
      await registry.connect(lender).fundAgreement(id, { value: principal });

      await expect(registry.connect(other).markDefaulted(id)).to.be.revertedWithCustomError(registry, "NotLender");
    });

    it("cannot be called before the duration has elapsed", async function () {
      const { registry, borrower, lender } = await deployAndParties();
      const id = loanHashFor("default-too-early");
      const principal = 1000n;
      await registry.connect(borrower).proposeAgreement(id, lender.address, principal, 500, 30 * DAY, { value: 100n });
      await registry.connect(lender).fundAgreement(id, { value: principal });

      await expect(registry.connect(lender).markDefaulted(id)).to.be.revertedWithCustomError(
        registry,
        "DurationNotElapsed",
      );
    });

    it("seizes the collateral for the lender once the duration has elapsed", async function () {
      const { registry, borrower, lender } = await deployAndParties();
      const id = loanHashFor("default-happy-path");
      const principal = 1000n;
      const collateral = ethers.parseEther("2");
      const durationSeconds = DAY;
      await registry
        .connect(borrower)
        .proposeAgreement(id, lender.address, principal, 500, durationSeconds, { value: collateral });
      await registry.connect(lender).fundAgreement(id, { value: principal });

      await networkHelpers.time.increase(durationSeconds + 1);

      const before = await ethers.provider.getBalance(lender.address);
      const tx = await registry.connect(lender).markDefaulted(id);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const after = await ethers.provider.getBalance(lender.address);

      await expect(tx).to.emit(registry, "AgreementDefaulted").withArgs(id, collateral);
      expect(after - before).to.equal(collateral - gasCost);
      expect((await registry.agreements(id)).status).to.equal(4n); // Defaulted
    });
  });
});
