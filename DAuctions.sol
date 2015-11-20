/* Stanford CS 251 Assignment 4

  Implement your auction system in this file. This should be the only
  file you need to submit.

  N.B. your code will automatically graded, so please do not change the
  signature of ANY of the functions provided in this file. You may of course
  add as many additional functions as you like.
*/

contract DAuction {
    // constructor
    function DAuction(uint256 reservePrice, uint256 biddingTimePeriod, address judgeAddress) {
        _reservePrice = reservePrice;
        _judgeAddress = judgeAddress;

        // Place your code here
    }

    // Three types of bidding functions. If not overriden, these generate errors
    function bid() returns(address highestBidder) {
        throw;
    }

    function commitBid(bytes32 bidCommitment) returns(bool) {
        throw;
    }

    function revealBid(bytes32 nonce) returns(address highestBidder) {
        throw;
    }

    function finalize() {
        // Place your code here
    }

    // Part 2
    function refund(uint256 refundAmount) {
        // Place your code here
    }

    // Place your code here
    address _judgeAddress;
    uint256 _reservePrice;
}

// Part 1
contract DDutchAuction is DAuction {

    // constructor
    function DDutchAuction(uint256 reservePrice, address judgeAddress, uint256 biddingPeriod, uint256 offerPriceDecrement) DAuction(reservePrice, biddingPeriod, judgeAddress) {
        _offerPriceDecrement = offerPriceDecrement;
        // Place your code here
    }

    function bid() returns(address highestBidder) {
        // Place your code here
    }

    // Place your code here
    uint256 _offerPriceDecrement;
}

// Part 3
contract DEnglishAuction is DAuction {

    // constructor
    function DEnglishAuction(uint256 reservePrice, address judgeAddress, uint256 biddingTimePeriod, uint256 minBidIncrement) DAuction(reservePrice, biddingTimePeriod, judgeAddress) {
        _minBidIncrement = minBidIncrement;
        _biddingTimePeriod = biddingTimePeriod;

        // Place your code here
    }

    function bid() returns(address highestBidder) {
        // Place your code here
    }

    // Place your code here
    uint256 _biddingTimePeriod;
    uint256 _minBidIncrement;
}

//Part 4
contract DVickreyAuction is DAuction {

    // constructor
    function DVickreyAuction(uint256 reservePrice, address judgeAddress, uint256 commitTimePeriod, uint256 revealTimePeriod, uint256 bidDepositAmount) DAuction(reservePrice, commitTimePeriod + revealTimePeriod, judgeAddress) {
        _bidDepositAmount = bidDepositAmount;

        // Place your code here
    }

    function commitBid(bytes32 bidCommitment) returns(bool) {
        // Place your code here
    }

    function revealBid(bytes32 nonce) returns(address highestBidder) {
        // Place your code here
    }

    // Place your code here
    uint256 _bidDepositAmount;
}

//This code is provided for you. You can modify if you need to for debugging, but you shouldn't need to put any logic here.
contract DAuctions {

    mapping(uint256 => DAuction) auctions;
    uint256 numAuctions;

    function beginDutchAuction(uint256 reservePrice, address judgeAddress, uint256 biddingTimePeriod, uint256 offerPriceDecrement) returns(uint256 auctionID) {
        auctionID = numAuctions++;
        auctions[auctionID] = new DDutchAuction(reservePrice, judgeAddress, biddingTimePeriod, offerPriceDecrement);
        return auctionID;
    }

    function beginEnglishAuction(uint256 reservePrice, address judgeAddress, uint256 biddingTimePeriod, uint256 minBidIncrement) returns(uint256 auctionID) {
        auctionID = numAuctions++;
        auctions[auctionID] = new DEnglishAuction(reservePrice, judgeAddress, biddingTimePeriod, minBidIncrement);
        return auctionID;
    }

    function beginVickreyAuction(uint256 reservePrice, address judgeAddress, uint256 commitTimePeriod, uint256 revealTimePeriod, uint256 bidDepositAmount) returns(uint256 auctionID) {
        auctionID = numAuctions++;
        auctions[auctionID] = new DVickreyAuction(reservePrice, judgeAddress, commitTimePeriod, revealTimePeriod, bidDepositAmount);
        return auctionID;
    }

    function bid(uint256 id) returns(address) {
        return auctions[id].bid.value(msg.value)();
    }

    function finalize(uint256 id) {
        auctions[id].finalize();
    }

    function refund(uint256 id, uint256 amount) {
        auctions[id].refund(amount);
    }

    function revealBid(uint256 id, bytes32 nonce) returns(address) {
        return auctions[id].revealBid.value(msg.value)(nonce);
    }

    function commitBid(uint256 id, bytes32 bidCommitment) returns(bool) {
        return auctions[id].commitBid.value(msg.value)(bidCommitment);
    }
}
