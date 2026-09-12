// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ArklakeInvoicePaymentPrototype} from "../contracts/ArklakeInvoicePaymentPrototype.sol";

interface Vm {
    function etch(address target, bytes calldata code) external;
    function expectRevert(bytes4 selector) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
}

contract MockUSDC {
    string public constant name = "USD Coin";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failTransfers;

    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function setFailTransfers(bool value) external { failTransfers = value; }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failTransfers) return false;
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ArklakeInvoicePaymentPrototypeTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant USDC = 0x3600000000000000000000000000000000000000;
    address private constant RECIPIENT = address(0xBEEF);
    uint256 private constant AMOUNT = 1_250_000;

    ArklakeInvoicePaymentPrototype private payment;
    MockUSDC private usdc;

    event InvoicePayment(
        bytes32 indexed referenceHash,
        address indexed payer,
        address indexed recipient,
        address token,
        uint256 amount,
        string paymentReference,
        string memo
    );

    function setUp() public {
        MockUSDC implementation = new MockUSDC();
        vm.etch(USDC, address(implementation).code);
        usdc = MockUSDC(USDC);
        payment = new ArklakeInvoicePaymentPrototype();
        usdc.mint(address(this), 10_000_000);
    }

    function testSuccessfulExactPaymentAndEvent() public {
        string memory paymentReference = "ARK-PROTOTYPE-001";
        string memory memo = "Thanks Miley";
        bytes32 referenceHash = keccak256(bytes(paymentReference));
        usdc.approve(address(payment), AMOUNT);

        vm.expectEmit(true, true, true, true);
        emit InvoicePayment(referenceHash, address(this), RECIPIENT, USDC, AMOUNT, paymentReference, memo);
        payment.pay(RECIPIENT, AMOUNT, paymentReference, memo);

        assert(usdc.balanceOf(address(this)) == 8_750_000);
        assert(usdc.balanceOf(RECIPIENT) == AMOUNT);
        assert(usdc.balanceOf(address(payment)) == 0);
        assert(payment.usedReferences(referenceHash));
    }

    function testDuplicateReferenceReverts() public {
        usdc.approve(address(payment), AMOUNT * 2);
        payment.pay(RECIPIENT, AMOUNT, "ARK-DUPLICATE", "Thanks Miley");
        vm.expectRevert(ArklakeInvoicePaymentPrototype.DuplicateReference.selector);
        payment.pay(RECIPIENT, AMOUNT, "ARK-DUPLICATE", "Thanks Miley");
    }

    function testEmptyReferenceReverts() public {
        vm.expectRevert(ArklakeInvoicePaymentPrototype.EmptyReference.selector);
        payment.pay(RECIPIENT, AMOUNT, "", "Thanks Miley");
    }

    function testReferenceOver32Utf8BytesReverts() public {
        vm.expectRevert(ArklakeInvoicePaymentPrototype.ReferenceTooLong.selector);
        payment.pay(RECIPIENT, AMOUNT, unicode"€€€€€€€€€€€", "Thanks Miley");
    }

    function testMemoAt64Utf8BytesIsPreserved() public {
        string memory memo = unicode"€€€€€€€€€€€€€€€€€€€€€a";
        assert(bytes(memo).length == 64);
        usdc.approve(address(payment), AMOUNT);
        payment.pay(RECIPIENT, AMOUNT, "ARK-MEMO-64", memo);
        assert(usdc.balanceOf(RECIPIENT) == AMOUNT);
    }

    function testMemoOver64Utf8BytesReverts() public {
        string memory memo = unicode"€€€€€€€€€€€€€€€€€€€€€€";
        assert(bytes(memo).length == 66);
        vm.expectRevert(ArklakeInvoicePaymentPrototype.MemoTooLong.selector);
        payment.pay(RECIPIENT, AMOUNT, "ARK-MEMO-TOO-LONG", memo);
    }

    function testZeroRecipientReverts() public {
        vm.expectRevert(ArklakeInvoicePaymentPrototype.InvalidRecipient.selector);
        payment.pay(address(0), AMOUNT, "ARK-ZERO-RECIPIENT", "Thanks Miley");
    }

    function testZeroAmountReverts() public {
        vm.expectRevert(ArklakeInvoicePaymentPrototype.InvalidAmount.selector);
        payment.pay(RECIPIENT, 0, "ARK-ZERO-AMOUNT", "Thanks Miley");
    }

    function testInsufficientAllowanceRevertsWithoutUsingReference() public {
        string memory paymentReference = "ARK-NO-ALLOWANCE";
        vm.expectRevert(ArklakeInvoicePaymentPrototype.TransferFromFailed.selector);
        payment.pay(RECIPIENT, AMOUNT, paymentReference, "Thanks Miley");
        assert(!payment.usedReferences(keccak256(bytes(paymentReference))));
    }

    function testTransferFalseRevertsWithoutUsingReference() public {
        string memory paymentReference = "ARK-TRANSFER-FAIL";
        usdc.approve(address(payment), AMOUNT);
        usdc.setFailTransfers(true);

        vm.expectRevert(ArklakeInvoicePaymentPrototype.TransferFromFailed.selector);
        payment.pay(RECIPIENT, AMOUNT, paymentReference, "Thanks Miley");

        assert(!payment.usedReferences(keccak256(bytes(paymentReference))));
        assert(usdc.balanceOf(RECIPIENT) == 0);
        assert(usdc.balanceOf(address(payment)) == 0);
    }
}
