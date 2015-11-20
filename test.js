/* Stanford CS 251 Assignment 4

  This file provides a testing framework and a suite of tests 
  for your auctions using the Ethereum VM.

  You may wish to modify this file to conduct additional tests.
  You're free to do so, though you won't be graded on this.

  N.B.: passing all of the tests in this file DOES NOT guarantee that
  your auction implementation is correct. There are many cases not tested
  here.

*/
// imports
var VM = require('ethereumjs-vm')
var Trie = require('merkle-patricia-tree')
var fs = require('fs')
var async = require('async')
var ethUtils = require('ethereumjs-util')
var Account = require('ethereumjs-account')
var Tx = require('ethereumjs-tx')
var Block = require('ethereumjs-block')
var test = require('tape')('cs251')
var crypto = require('crypto')
var solc = require('solc')

var mainContractName = "DAuctions";

// Ethereum state tree
var stateTrie = new Trie()
    // Create vm
var vm = new VM(stateTrie)

// accounts; will be populated later
// different accounts simulate multiple parties bidding on an auction
var accounts = []
    // the address of the auction contract
var createdAddress

var code = "";
// read in the Solidity code and compile it
var args = process.argv
var sourceCode = fs.readFileSync(args[2]).toString()
var compilationResults = solc.compile(sourceCode, 0) // 1 activates the optimiser

var startBalance = 100000

if ("errors" in compilationResults) {
    console.log("Compilation failed with errors:");
    console.log(compilationResults.errors);
    throw new Error("Compilation failed");
} else {
    console.log("Compiled \"" + args[2] + "\" successfully.");
}

// compiled Solidity code
var contractCode = {}
var abi = {}
for (var contractName in compilationResults.contracts) {
    code = compilationResults.contracts[contractName].bytecode
        // fix padding
    if (code.length % 2 == 1) {
        code = code + '0'
    }
    code = new Buffer(code, 'hex')
    contractCode[contractName] = code;

    abi[contractName] = {}
        // addresses of functions which will be compiled
    hashes = compilationResults.contracts[contractName].functionHashes;
    for (var functionName in hashes) {
        var n = functionName.indexOf("(");
        abi[contractName][functionName.substring(0, n)] = "0x" + hashes[functionName];
    }
}

var auctionIDs = {}

async.series([
    setup,
    function checkContractCreation(done) {
        var account = accounts[0]
        runTx({
            account: account,
            data: contractCode[mainContractName],
            to: '',
        }, function(results) {
            createdAddress = results.createdAddress
            test.assert(results.vm.return.toString('hex') !== '', 'create a contract and receive address')
        }, done)
    },

    function createDutchAuction(done) {
        runTx({
                account: accounts[0],
                data: abi[mainContractName].beginDutchAuction + uint256String(500) + nullAddress() + uint256String(10) + uint256String(25),
            },
            function(results) {
                // save the id
                auctionIDs.dutchAuctionId = results.vm.return
                test.assert(results.vm.return.toString('hex') !== '', 'create a Dutch auction and receive auction ID')
            }, done)
    },

    function bidOnDutchAuctionBad(done) {
        runTx({
            account: accounts[1],
            data: abi[mainContractName].bid + auctionIDs.dutchAuctionId.toString('hex'),
            value: 424,
            blockNum: 3
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.ok(!returnVal, 'submit an invalid bid to the Dutch auction')
        }, done)
    },

    function bidOnDutchAuctionGood(done) {
        runTx({
            account: accounts[2],
            data: abi[mainContractName].bid + auctionIDs.dutchAuctionId.toString('hex'),
            value: 400,
            blockNum: 4
        }, function(results) {
            test.assert(results.vm.return.toString('hex') !== '', 'submit a winning bid to the Dutch auction')
        }, done)
    },

    function bidOnDutchAuctionLate(done) {
        runTx({
            account: accounts[3],
            data: abi[mainContractName].bid + auctionIDs.dutchAuctionId.toString('hex'),
            value: 450,
            blockNum: 5
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.notEqual(returnVal, accounts[3].address.toString('hex'), 'submit a late bid to the Dutch auction')
        }, done)
    },

    function checkDutchAuctionSettled(done) {
        queryAllAccountBalances(function(v) {
            test.equal(accounts[0].balance, startBalance + 400, "verify address 0 was credited in Dutch auction")
            test.equal(accounts[1].balance, startBalance, "verify address 1 didn't pay in Dutch auction")
            test.equal(accounts[2].balance, startBalance - 400, "verify address 2 was debited in Dutch auction")
            resetAccountBalances(done)
        })
    },

    function createSecondDutchAuction(done) {
        runTx({
                account: accounts[0],
                data: abi[mainContractName].beginDutchAuction + uint256String(500) + ethUtil.pad(accounts[4].address, 32).toString('hex') + uint256String(10) + uint256String(25),
                blockNum: 0
            },
            function(results) {
                // save the id
                auctionIDs.dutchAuctionId2 = results.vm.return
                test.assert(results.vm.return.toString('hex') !== '', 'create a second Dutch auction (with judge) and receive auction ID')
            }, done)
    },

    function bidOnSecondDutchAuctionGood(done) {
        runTx({
            account: accounts[1],
            data: abi[mainContractName].bid + auctionIDs.dutchAuctionId2.toString('hex'),
            value: 400,
            blockNum: 4
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.equal(returnVal, accounts[1].address.toString('hex'), 'submit a winning bid to the second Dutch auction')
        }, done)
    },

    function earlyFinalizeSecondDutchAuctionGood(done) {
        runTx({
            account: accounts[0],
            data: abi[mainContractName].finalize + auctionIDs.dutchAuctionId2.toString('hex'),
            value: 0,
            blockNum: 5
        }, function(results) {
            test.assert(results.vm.return.toString('hex') == '', 'test invalid finalize for second Dutch auction')
        }, done)
    },

    function checkSecondDutchAuctionSettled(done) {
        runTx({
                account: accounts[1],
                data: abi[mainContractName].finalize + auctionIDs.dutchAuctionId2.toString('hex'),
                blockNum: 15,
            }, function(results) {},
            function() {
                queryAllAccountBalances(function(v) {
                    test.equal(accounts[0].balance, startBalance + 400, "verify address 0 was credited in second Dutch auction")
                    test.equal(accounts[1].balance, startBalance - 400, "verify address 1 was debited in second Dutch auction")
                    resetAccountBalances(done)
                })
            })
    },

    function createThirdDutchAuction(done) {
        runTx({
                account: accounts[0],
                data: abi[mainContractName].beginDutchAuction + uint256String(500) + ethUtil.pad(accounts[4].address, 32).toString('hex') + uint256String(10) + uint256String(25),
                blockNum: 0
            },
            function(results) {
                // save the id
                auctionIDs.dutchAuctionId3 = results.vm.return
                test.assert(results.vm.return.toString('hex') !== '', 'create a third Dutch auction (with judge) and receive auction ID')
            }, done)
    },

    function bidOnThirdDutchAuctionGood(done) {
        runTx({
            account: accounts[1],
            data: abi[mainContractName].bid + auctionIDs.dutchAuctionId3.toString('hex'),
            value: 400,
            blockNum: 4
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.equal(returnVal, accounts[1].address.toString('hex'), 'submit a winning bid to the third Dutch auction')
        }, done)
    },

    function checkThirdDutchAuctionSettled(done) {
        runTx({
                account: accounts[4],
                data: abi[mainContractName].refund + auctionIDs.dutchAuctionId3.toString('hex') + uint256String(200),
                blockNum: 15,
            }, function(results) {},
            function() {
                queryAllAccountBalances(function(v) {
                    test.equal(accounts[0].balance, startBalance + 200, "verify address 0 was credited in second Dutch auction (minus refund)")
                    test.equal(accounts[1].balance, startBalance - 200, "verify address 1 paid in second Dutch auction (minus refund)")
                    resetAccountBalances(done)
                })
            })
    },


    function createEnglishAuction(done) {
        runTx({
            account: accounts[0],
            // no judge
            data: abi[mainContractName].beginEnglishAuction + uint256String(300) + nullAddress() + uint256String(10) + uint256String(25),
        }, function(results) {
            auctionIDs.englishAuctionId = results.vm.return
            test.assert(results.vm.return.toString('hex') !== '', 'create an English auction and receive auction ID')
        }, done)
    },

    function firstBidOnEnglish(done) {
        runTx({
            account: accounts[1],
            data: abi[mainContractName].bid + auctionIDs.englishAuctionId.toString('hex'),
            value: 400
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.equal(returnVal, accounts[1].address.toString('hex'), 'submit a bid to the English auction')
        }, done)
    },

    function secondBidOnEnglish(done) {
        runTx({
            account: accounts[2],
            data: abi[mainContractName].bid + auctionIDs.englishAuctionId.toString('hex'),
            value: 399
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.notEqual(returnVal, accounts[1].address.toString('hex'), 'submit a lower bid to the English auction')
        }, done)
    },

    function thirdBidOnEnglish(done) {
        runTx({
            account: accounts[3],
            data: abi[mainContractName].bid + auctionIDs.englishAuctionId.toString('hex'),
            value: 450,
            blockNum: 2,
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.equal(returnVal, accounts[3].address.toString('hex'), 'submit a higher bid to the English auction')
        }, done)
    },

    function fourthBidOnEnglish(done) {
        runTx({
            account: accounts[2],
            data: abi[mainContractName].bid + auctionIDs.englishAuctionId.toString('hex'),
            value: 455,
            blockNum: 2,
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.notEqual(returnVal, accounts[2].address.toString('hex'), 'submit an insufficiently higher bid to the English auction')
        }, done)
    },

    function lateBidOnEnglish(done) {
        runTx({
            account: accounts[4],
            data: abi[mainContractName].bid + auctionIDs.englishAuctionId.toString('hex'),
            value: 1000,
            blockNum: 13,
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.notEqual(returnVal, accounts[4].address.toString('hex'), 'submit a late bid to the English auction')
        }, done)
    },

    function checkEnglishAuctionSettled(done) {
        runTx({
                account: accounts[0],
                data: abi[mainContractName].finalize + auctionIDs.englishAuctionId.toString('hex'),
                blockNum: 15,
            }, function(results) {},
            function() {
                queryAllAccountBalances(function(v) {
                    test.equal(accounts[0].balance, startBalance + 450, "verify address 0 was credited in English auction")
                    test.equal(accounts[1].balance, startBalance, "verify address 1 didn't pay in English auction")
                    test.equal(accounts[2].balance, startBalance, "verify address 2 didn't pay in English auction")
                    test.equal(accounts[3].balance, startBalance - 450, "verify address 3 was debited in English auction")
                    test.equal(accounts[4].balance, startBalance, "verify address 4 didn't pay in English auction")
                    resetAccountBalances(done)
                })
            })
    },

    function createVickreyAuction(done) {
        runTx({
            account: accounts[0],
            // no judge
            data: abi[mainContractName].beginVickreyAuction + uint256String(500) + nullAddress() + uint256String(10) + uint256String(10) + uint256String(5000),
        }, function(results) {
            auctionIDs.vickreyAuctionId = results.vm.return
            test.assert(results.vm.return.toString('hex') !== '', 'create a Vickrey auction and receive auction ID')
        }, done)
    },

    function submitFirstVickreyBid(done) {
        var nonce = accounts[1].bidNonce
        var value = 600
        var paddedValue = ethUtils.pad(ethUtils.toBuffer(value), 32)
        var commitment = ethUtils.sha3(Buffer.concat([nonce, paddedValue]))
        runTx({
            account: accounts[1],
            data: abi[mainContractName].commitBid + auctionIDs.vickreyAuctionId.toString('hex') + commitment.toString('hex'),
            value: 5000
        }, function(results) {
            test.assert(results.vm.return.toString('hex') !== '', 'commit first bid to Vickrey auction')
        }, done)
    },

    function submitSecondVickreyBid(done) {
        var nonce = accounts[2].bidNonce
        var value = 1000
        var paddedValue = ethUtils.pad(ethUtils.toBuffer(value), 32)
        var commitment = ethUtils.sha3(Buffer.concat([nonce, paddedValue]))
        runTx({
            account: accounts[2],
            data: abi[mainContractName].commitBid + auctionIDs.vickreyAuctionId.toString('hex') + commitment.toString('hex'),
            value: 5000
        }, function(results) {
            test.assert(results.vm.return.toString('hex') !== '', 'commit second bid to Vickrey auction')
        }, done)
    },

    function submitThirdVickreyBid(done) {
        var nonce = accounts[3].bidNonce
        var value = 800
        var paddedValue = ethUtils.pad(ethUtils.toBuffer(value), 32)
        var commitment = ethUtils.sha3(Buffer.concat([nonce, paddedValue]))
        runTx({
            account: accounts[3],
            data: abi[mainContractName].commitBid + auctionIDs.vickreyAuctionId.toString('hex') + commitment.toString('hex'),
            value: 5000,
            blockNum: 9
        }, function(results) {
            test.assert(results.vm.return.toString('hex') !== '', 'commit third bid to Vickrey auction')
        }, done)
    },

    function submitCheapskateVickreyBid(done) {
        var nonce = accounts[4].bidNonce
        var value = 1200
        var paddedValue = ethUtils.pad(ethUtils.toBuffer(value), 32)
        var commitment = ethUtils.sha3(Buffer.concat([nonce, paddedValue]))
        runTx({
            account: accounts[4],
            data: abi[mainContractName].commitBid + auctionIDs.vickreyAuctionId.toString('hex') + commitment.toString('hex'),
            value: 4000
        }, function(results) {
            test.assert(results.vm.return.toString('hex') == '', 'commit bid to Vickrey auction without deposit')
        }, done)
    },

    function submitLateVickreyBid(done) {
        var nonce = accounts[4].bidNonce
        var value = 1500
        var paddedValue = ethUtils.pad(ethUtils.toBuffer(value), 32)
        var commitment = ethUtils.sha3(Buffer.concat([nonce, paddedValue]))
        runTx({
            account: accounts[4],
            data: abi[mainContractName].commitBid + auctionIDs.vickreyAuctionId.toString('hex') + commitment.toString('hex'),
            value: 5000,
            blockNum: 10
        }, function(results) {
            test.assert(results.vm.return.toString('hex') == '', 'commit fashionably late bid to Vickrey auction')
        }, done)
    },

    function openFirstVickreyBidEarly(done) {
        var nonce = accounts[1].bidNonce
        runTx({
            account: accounts[1],
            data: abi[mainContractName].revealBid + auctionIDs.vickreyAuctionId.toString('hex') + nonce.toString('hex'),
            value: 600,
            blockNum: 9
        }, function(results) {
            test.assert(results.vm.return.toString('hex') == '', 'open first bid to Vickrey auction too early')
        }, done)
    },

    function openFirstVickreyBid(done) {
        var nonce = accounts[1].bidNonce
        runTx({
            account: accounts[1],
            data: abi[mainContractName].revealBid + auctionIDs.vickreyAuctionId.toString('hex') + nonce.toString('hex'),
            value: 600,
            blockNum: 10
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.equal(returnVal, accounts[1].address.toString('hex'), 'open first bid to Vickrey auction')
        }, done)
    },

    function openSecondVickreyBid(done) {
        var nonce = accounts[2].bidNonce
        runTx({
            account: accounts[2],
            data: abi[mainContractName].revealBid + auctionIDs.vickreyAuctionId.toString('hex') + nonce.toString('hex'),
            value: 1000,
            blockNum: 10
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.equal(returnVal, accounts[2].address.toString('hex'), 'open second bid to Vickrey auction')
        }, done)
    },

    function openThirdVickreyBidWrongValue(done) {
        var nonce = accounts[3].bidNonce
        runTx({
            account: accounts[3],
            data: abi[mainContractName].revealBid + auctionIDs.vickreyAuctionId.toString('hex') + nonce.toString('hex'),
            value: 700,
            blockNum: 10
        }, function(results) {
            test.assert(results.vm.return.toString('hex') == '', 'open third bid to Vickrey auction with wrong value')
        }, done)
    },

    function openThirdVickreyBidWrongValue(done) {
        var nonce = crypto.randomBytes(32)
        runTx({
            account: accounts[3],
            data: abi[mainContractName].revealBid + auctionIDs.vickreyAuctionId.toString('hex') + nonce.toString('hex'),
            value: 800,
            blockNum: 10
        }, function(results) {
            test.assert(results.vm.return.toString('hex') == '', 'open third bid to Vickrey auction with wrong nonce')
        }, done)
    },

    function openThirdVickreyBid(done) {
        var nonce = accounts[3].bidNonce
        runTx({
            account: accounts[3],
            data: abi[mainContractName].revealBid + auctionIDs.vickreyAuctionId.toString('hex') + nonce.toString('hex'),
            value: 800,
            blockNum: 10
        }, function(results) {
            var returnVal = ethUtils.unpad(results.vm.return).toString('hex')
            test.equal(returnVal, accounts[2].address.toString('hex'), 'open third bid to Vickrey auction')
        }, done)
    },

    function openBadVickreyBid(done) {
        var nonce = accounts[4].bidNonce
        runTx({
            account: accounts[4],
            data: abi[mainContractName].revealBid + auctionIDs.vickreyAuctionId.toString('hex') + nonce.toString('hex'),
            value: 1200,
            blockNum: 10
        }, function(results) {
            test.assert(results.vm.return.toString('hex') == '', 'open unsubmitted bid to Vickrey auction')
        }, done)
    },

    function checkVickreyAuctionSettled(done) {
        runTx({
                account: accounts[0],
                data: abi[mainContractName].finalize + auctionIDs.vickreyAuctionId.toString('hex'),
                blockNum: 25,
            }, function(results) {},
            function() {
                queryAllAccountBalances(function(v) {
                    test.equal(accounts[0].balance, startBalance + 800, "verify address 0 was credited in Vickrey auction")
                    test.equal(accounts[1].balance, startBalance, "verify address 1 didn't pay in Vickrey auction")
                    test.equal(accounts[2].balance, startBalance - 800, "verify address 2 was debited in Vickrey auction")
                    test.equal(accounts[3].balance, startBalance, "verify address 3 didn't pay in Vickrey auction")
                    test.equal(accounts[4].balance, startBalance, "verify address 4 didn't pay in Vickrey auction")
                    resetAccountBalances(done)
                })
            })
    },

    // add more tests here...
])

// setup function. It populates the state with a few accounts. 
function setup(cb) {
    for (var i = 0; i < 5; i++) {
        var rand = crypto.randomBytes(32)
        accounts.push({
            privateKey: rand,
            address: ethUtils.privateToAddress(rand),
            nonce: 0,
            bidNonce: crypto.randomBytes(32)
        })
        console.log("Created address " + i + ": " + accounts[accounts.length - 1].address.toString('hex'));
    }

    // store each account in the trie
    async.each(accounts, function(a, done) {
        var account = new Account()
            // give the account some serious wei
        account.balance = startBalance
        stateTrie.put(a.address, account.serialize(), done)
    }, cb)
}

function uintString(n, b) {
    return ethUtils.pad(ethUtils.toBuffer(n), b / 8).toString('hex');
}

function uint256String(n) {
    return uintString(n, 256)
}

function nullAddress() {
    return uintString(0, 256)
}


function queryAccountBalance(i, cb) {
    stateTrie.get(accounts[2].address, function(err, results) {
        var account = new Account(results)
        cb(ethUtils.bufferToInt(account.balance))
    })
}

function queryAllAccountBalances(cb) {
    accountNumbers = []
    for (var i = 0; i < accounts.length; i++) {
        accountNumbers[i] = i
    }
    async.each(accountNumbers, function(i, done) {
        stateTrie.get(accounts[i].address, function(err, results) {
            var account = new Account(results)
            accounts[i].balance = ethUtils.bufferToInt(account.balance)
            done()
        })
    }, cb)
}

function resetAccountBalances(cb) {
    accountNumbers = []
    for (var i = 0; i < accounts.length; i++) {
        accountNumbers[i] = i
    }
    async.each(accountNumbers, function(i, done) {
        stateTrie.get(accounts[i].address, function(err, results) {
            var account = new Account(results)
            account.balance = startBalance
            stateTrie.put(accounts[i].address, account.serialize(), done)
        })
    }, cb)
}

// a simple helper function; it forms a transaction and runs it in the vm
function runTx(opts, test, cb) {

    var fakeBlock = new Block()
    fakeBlock.header.gasLimit = '0xfffffffffffff'
    fakeBlock.header.number = (opts.blockNum ? opts.blockNum : 0)
    fakeBlock.header.timestamp = (opts.blockTimestamp ? opts.blockTimestamp : 0)

    if (!opts.to) {
        opts.to = createdAddress;
    }

    var rawTx = {
        to: opts.to,
        nonce: opts.account.nonce++,
        value: opts.value,
        gasPrice: '0x00',
        gasLimit: '0xffff90710', // set a high gas limit so we don't run out of gas
        data: opts.data
    }

    var tx = new Tx(rawTx)
    tx.sign(opts.account.privateKey)

    vm.runTx({
        tx: tx,
        block: fakeBlock
    }, function(err, results) {
        test(results)
        cb()
    })
}
