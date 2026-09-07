// SPDX-License-Identifier: MIT
pragma solidity ^0.8.34;

/// @title AcorisLoanRegistry
/// @notice Executes loan agreements reached by Acoris's off-chain AI
/// negotiation engine (Phase 3A) on Creditcoin CC3 Testnet. Principal and
/// collateral are native CTC — kept deliberately simple (no ERC-20 approval
/// flow) for the hackathon MVP; a production version could support ERC-20
/// principal/collateral instead.
///
/// `FundLoan`/`RepayLoan` deliberately mirror the exact event shape
/// (`bytes32 loanHash, address lender, address borrower, uint256 amount`,
/// all non-indexed) that Acoris's Phase 2 Attestcoin pipeline
/// (web/lib/attestcoin.ts, LOAN_PAYMENT_ABI) already knows how to verify —
/// a real repayment on THIS contract is provable with the exact same
/// QueryBuilder query already built, closing the loop between the verified
/// financial profile and loan execution.
contract AcorisLoanRegistry {
    enum AgreementStatus {
        None,
        Proposed,
        Funded,
        Repaid,
        Defaulted,
        Cancelled
    }

    struct Agreement {
        address borrower;
        address lender;
        uint256 principal; // loan amount, wei
        uint256 collateral; // wei, deposited by the borrower at proposal time
        uint16 aprBps; // annual rate, basis points (900 = 9.00%)
        uint64 durationSeconds;
        uint64 fundedAt;
        AgreementStatus status;
    }

    mapping(bytes32 => Agreement) public agreements;

    event AgreementProposed(
        bytes32 indexed loanHash,
        address indexed borrower,
        address indexed lender,
        uint256 principal,
        uint256 collateral,
        uint16 aprBps,
        uint64 durationSeconds
    );
    event AgreementCancelled(bytes32 indexed loanHash);
    // Non-indexed on purpose — matches web/lib/attestcoin.ts's LOAN_PAYMENT_ABI exactly.
    event FundLoan(bytes32 loanHash, address lender, address borrower, uint256 amount);
    event RepayLoan(bytes32 loanHash, address lender, address borrower, uint256 amount);
    event AgreementDefaulted(bytes32 indexed loanHash, uint256 collateralSeized);

    error AgreementAlreadyExists();
    error AgreementNotFound();
    error NotBorrower();
    error NotLender();
    error WrongStatus();
    error IncorrectValue();
    error DurationNotElapsed();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();

    /// @notice Borrower proposes an agreement matching negotiated terms and
    /// deposits collateral (msg.value). `loanHash` must be a unique id for
    /// this deal (e.g. derived from the negotiation record) — reusing one
    /// reverts.
    function proposeAgreement(
        bytes32 loanHash,
        address lender,
        uint256 principal,
        uint16 aprBps,
        uint64 durationSeconds
    ) external payable {
        if (agreements[loanHash].status != AgreementStatus.None) revert AgreementAlreadyExists();
        if (lender == address(0)) revert ZeroAddress();
        if (principal == 0) revert ZeroAmount();
        if (msg.value == 0) revert ZeroAmount();

        agreements[loanHash] = Agreement({
            borrower: msg.sender,
            lender: lender,
            principal: principal,
            collateral: msg.value,
            aprBps: aprBps,
            durationSeconds: durationSeconds,
            fundedAt: 0,
            status: AgreementStatus.Proposed
        });

        emit AgreementProposed(loanHash, msg.sender, lender, principal, msg.value, aprBps, durationSeconds);
    }

    /// @notice Borrower withdraws a proposal that hasn't been funded yet, reclaiming collateral.
    function cancelProposal(bytes32 loanHash) external {
        Agreement storage a = agreements[loanHash];
        if (a.status == AgreementStatus.None) revert AgreementNotFound();
        if (a.status != AgreementStatus.Proposed) revert WrongStatus();
        if (msg.sender != a.borrower) revert NotBorrower();

        uint256 refund = a.collateral;
        a.collateral = 0;
        a.status = AgreementStatus.Cancelled;

        emit AgreementCancelled(loanHash);

        (bool ok, ) = payable(a.borrower).call{value: refund}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Named lender funds the loan (msg.value must equal principal exactly);
    /// principal is forwarded to the borrower immediately.
    function fundAgreement(bytes32 loanHash) external payable {
        Agreement storage a = agreements[loanHash];
        if (a.status == AgreementStatus.None) revert AgreementNotFound();
        if (a.status != AgreementStatus.Proposed) revert WrongStatus();
        if (msg.sender != a.lender) revert NotLender();
        if (msg.value != a.principal) revert IncorrectValue();

        a.status = AgreementStatus.Funded;
        a.fundedAt = uint64(block.timestamp);

        emit FundLoan(loanHash, a.lender, a.borrower, a.principal);

        (bool ok, ) = payable(a.borrower).call{value: a.principal}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Simple non-compounding interest for the full agreed duration: principal * aprBps * durationSeconds / (365 days * 10000).
    function repaymentAmount(bytes32 loanHash) public view returns (uint256) {
        Agreement storage a = agreements[loanHash];
        uint256 interest = (a.principal * a.aprBps * a.durationSeconds) / (365 days * 10000);
        return a.principal + interest;
    }

    /// @notice Borrower repays principal + interest (msg.value must match exactly);
    /// lender receives the repayment, borrower's collateral is returned.
    function repay(bytes32 loanHash) external payable {
        Agreement storage a = agreements[loanHash];
        if (a.status == AgreementStatus.None) revert AgreementNotFound();
        if (a.status != AgreementStatus.Funded) revert WrongStatus();
        if (msg.sender != a.borrower) revert NotBorrower();

        uint256 owed = repaymentAmount(loanHash);
        if (msg.value != owed) revert IncorrectValue();

        uint256 collateralToReturn = a.collateral;
        a.collateral = 0;
        a.status = AgreementStatus.Repaid;

        emit RepayLoan(loanHash, a.lender, a.borrower, owed);

        (bool okLender, ) = payable(a.lender).call{value: owed}("");
        if (!okLender) revert TransferFailed();
        (bool okBorrower, ) = payable(a.borrower).call{value: collateralToReturn}("");
        if (!okBorrower) revert TransferFailed();
    }

    /// @notice Lender claims collateral after the agreed duration has elapsed without repayment.
    function markDefaulted(bytes32 loanHash) external {
        Agreement storage a = agreements[loanHash];
        if (a.status == AgreementStatus.None) revert AgreementNotFound();
        if (a.status != AgreementStatus.Funded) revert WrongStatus();
        if (msg.sender != a.lender) revert NotLender();
        if (block.timestamp < a.fundedAt + a.durationSeconds) revert DurationNotElapsed();

        uint256 seized = a.collateral;
        a.collateral = 0;
        a.status = AgreementStatus.Defaulted;

        emit AgreementDefaulted(loanHash, seized);

        (bool ok, ) = payable(a.lender).call{value: seized}("");
        if (!ok) revert TransferFailed();
    }
}
