// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Prototype {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice TESTNET PROTOTYPE ONLY. Not audited or intended for production use.
contract ArklakeInvoicePaymentPrototype {
    address public constant USDC = 0x3600000000000000000000000000000000000000;
    uint256 public constant MAX_MEMO_BYTES = 64;

    mapping(bytes32 referenceHash => bool used) public usedReferences;

    error DuplicateReference();
    error EmptyReference();
    error InexactTransfer();
    error InvalidAmount();
    error InvalidRecipient();
    error MemoTooLong();
    error ReferenceTooLong();
    error TransferFromFailed();

    event InvoicePayment(
        bytes32 indexed referenceHash,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 amount,
        string paymentReference,
        string memo
    );

    function pay(
        address recipient,
        uint256 amount,
        string calldata paymentReference,
        string calldata memo
    ) external {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();

        uint256 referenceLength = bytes(paymentReference).length;
        if (referenceLength == 0) revert EmptyReference();
        if (referenceLength > 32) revert ReferenceTooLong();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();

        bytes32 referenceHash = keccak256(bytes(paymentReference));
        if (usedReferences[referenceHash]) revert DuplicateReference();
        usedReferences[referenceHash] = true;

        IERC20Prototype token = IERC20Prototype(USDC);
        uint256 recipientBalanceBefore = token.balanceOf(recipient);
        uint256 retainedBalanceBefore = token.balanceOf(address(this));

        (bool success, bytes memory result) = USDC.call(
            abi.encodeCall(IERC20Prototype.transferFrom, (msg.sender, recipient, amount))
        );
        if (!success || (result.length != 0 && !abi.decode(result, (bool)))) revert TransferFromFailed();

        if (
            token.balanceOf(recipient) != recipientBalanceBefore + amount
                || token.balanceOf(address(this)) != retainedBalanceBefore
        ) revert InexactTransfer();

        _emitInvoicePayment(referenceHash, recipient, amount, paymentReference, memo);
    }

    function _emitInvoicePayment(
        bytes32 referenceHash,
        address recipient,
        uint256 amount,
        string calldata paymentReference,
        string calldata memo
    ) private {
        emit InvoicePayment(referenceHash, msg.sender, recipient, USDC, amount, paymentReference, memo);
    }
}
