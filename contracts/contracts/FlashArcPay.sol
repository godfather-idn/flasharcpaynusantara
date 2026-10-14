// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FlashArcPay is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdcToken;
    
    // Mapping to track processed orders for replay protection
    // Order hash = keccak256(merchant, orderId, amount)
    mapping(bytes32 => bool) public processedOrders;

    // Event emitted when a payment is processed
    event PaymentProcessed(
        address indexed merchant,
        address indexed payer,
        bytes32 indexed orderHash,
        string orderId,
        uint256 amount,
        uint256 timestamp
    );

    constructor(address _usdcToken) {
        require(_usdcToken != address(0), "Invalid USDC token address");
        usdcToken = IERC20(_usdcToken);
    }

    /**
     * @dev Generate order hash for replay protection
     * @param merchant Address of the merchant receiving payment
     * @param orderId Unique order identifier (string)
     * @param amount Payment amount in USDC (6 decimals)
     * @return bytes32 Order hash
     */
    function getOrderHash(
        address merchant,
        string memory orderId,
        uint256 amount
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(merchant, orderId, amount));
    }

    /**
     * @dev Process payment from payer to merchant with replay protection
     * @param merchant Address of the merchant receiving payment
     * @param orderId Unique order identifier (string)
     * @param amount Payment amount in USDC (6 decimals)
     */
    function payMerchant(
        address merchant,
        string memory orderId,
        uint256 amount
    ) external nonReentrant {
        require(merchant != address(0), "Invalid merchant address");
        require(amount > 0, "Amount must be greater than zero");
        require(
            usdcToken.balanceOf(msg.sender) >= amount,
            "Insufficient USDC balance"
        );

        // Generate order hash for replay protection
        bytes32 orderHash = getOrderHash(merchant, orderId, amount);

        // Check if order has already been processed
        require(!processedOrders[orderHash], "Order already processed");

        // Mark order as processed
        processedOrders[orderHash] = true;

        // Transfer USDC from payer to merchant
        usdcToken.safeTransferFrom(msg.sender, merchant, amount);

        // Emit payment processed event
        emit PaymentProcessed(
            merchant,
            msg.sender,
            orderHash,
            orderId,
            amount,
            block.timestamp
        );
    }

    /**
     * @dev Check if an order has been processed
     * @param merchant Address of the merchant
     * @param orderId Unique order identifier (string)
     * @param amount Payment amount in USDC (6 decimals)
     * @return bool True if order has been processed
     */
    function isOrderProcessed(
        address merchant,
        string memory orderId,
        uint256 amount
    ) external view returns (bool) {
        bytes32 orderHash = getOrderHash(merchant, orderId, amount);
        return processedOrders[orderHash];
    }
}
