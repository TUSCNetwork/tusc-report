var config = require("../config");
var bts = require("tuscjs-ws");

var _require = require("tuscjs"),
    ChainTypes = _require.ChainTypes,
    ChainStore = _require.ChainStore,
    FetchChain = _require.FetchChain;

var operations = ChainTypes.operations;

var ops = Object.keys(operations);

var blockData = {};
var assetData = {};

function connect() {
    return new Promise(function(resolve) {
        bts.Apis.instance(config.apiNode, true)
            .init_promise.then(function(res) {
                ChainStore.init(false).then(function() {
                    resolve(res);
                });
            })
            .catch(function(err) {
                console.error("Error connection to node:", err);
            });
    });
}

function disconnect() {
    bts.Apis.instance().close();
}

function getUser(name) {
    return new Promise(function(resolve, reject) {
        var _FetchChain;

        FetchChain(
            "getAccount",
            name,
            undefined,
            ((_FetchChain = {}), (_FetchChain[name] = false), _FetchChain)
        )
            .then(function(result) {
                var account = result.toJS();
                if (!account.balances) account.balances = {};
                if (!account.call_orders) account.call_orders = [];
                var assets = Object.keys(account.balances);

                // account.call_orders.forEach(c => {
                //     let balanceIndex = account.balances.findIndex(b => {
                //         return b.asset_type === c.call_price.base.asset_id;
                //     });
                //     if(balanceIndex !== -1) {
                //         let newBalance = parseInt(account.balances[balanceIndex].balance, 10) +
                //         parseInt(c.collateral, 10);
                //         account.balances[balanceIndex].balance = newBalance;
                //     } else {
                //         assets.push(c.call_price.base.asset_id);
                //         account.balances.push({
                //             balance: c.collateral,
                //             asset_type: c.call_price.base.asset_id
                //         });
                //     }
                // });

                resolve({
                    accountId: account.id,
                    assets: assets,
                    balances: account.balances
                });
            })
            .catch(reject);
    });
}

function getBlockTime(block) {
    return new Promise(function(resolve, reject) {
        if (blockData[block]) return resolve(blockData[block]);

        bts.Apis.instance()
            .db_api()
            .exec("get_block", [block])
            .then(function(result) {
                blockData[block] = new Date(result.timestamp + "Z");
                resolve(blockData[block]);
            })
            .catch(reject);
    });
}

function getAssetData(asset) {
    return new Promise(function(resolve, reject) {
        var _FetchChain2;

        if (assetData[asset]) return resolve(assetData[asset]);

        FetchChain(
            "getObject",
            asset,
            undefined,
            ((_FetchChain2 = {}), (_FetchChain2[asset] = false), _FetchChain2)
        )
            .then(function(result) {
                var a = result.toJS();
                assetData[asset] = {
                    symbol: a.symbol.replace(
                        /OPEN\.|BRIDGE\.|RUDEX\.|GDEX\.|BLOCK\./,
                        ""
                    ),
                    precision: a.precision
                };
                resolve(assetData[asset]);
            })
            .catch(function(err) {
                reject();
            });
    });
}

function resolveBlockTimes(operations) {
    return new Promise(function(resolve, reject) {
        var promises = operations.map(function(op) {
            if (op.block_time)
                blockData[op.block_num] = new Date(op.block_time);
            return getBlockTime(op.block_num);
        });
        Promise.all(promises)
            .then(resolve)
            .catch(reject);
    });
}

function resolveAssets(operations, list) {
    return new Promise(function(resolve, reject) {
        var promises = [];
        var assets = {};
        if (operations) {
            operations.forEach(function(record) {
                var type = ops[record.op[0]];
                switch (type) {
                    case "transfer": {
                        // console.log("transfer record.op:", record.op);
                        assets[record.op[1].amount.asset_id] = true;
                        assets[record.op[1].fee.asset_id] = true;
                        break;
                    }
                    case "fill_order": {
                        assets[record.op[1].pays.asset_id] = true;
                        assets[record.op[1].receives.asset_id] = true;
                        assets[record.op[1].fee.asset_id] = true;
                        break;
                    }
                    case "asset_issue": {
                        assets[record.op[1].asset_to_issue.asset_id] = true;
                        assets[record.op[1].fee.asset_id] = true;
                        break;
                    }
                    default: {
                        break;
                    }
                }
            });
        }

        if (list) {
            list.forEach(function(entry) {
                assets[entry] = true;
            });
        }

        Object.keys(assets).forEach(function(asset_id) {
            if (!assetData[asset_id] && !!asset_id) {
                promises.push(getAssetData(asset_id));
            }
        });
        Promise.all(promises)
            .then(resolve)
            .catch(reject);
    });
}

function getAsset(id) {
    return assetData[id];
}

function getBlock(block_num) {
    return blockData[block_num];
}

module.exports = {
    connect: connect,
    disconnect: disconnect,
    getUser: getUser,
    getBlockTime: getBlockTime,
    getAssetData: getAssetData,
    resolveAssets: resolveAssets,
    resolveBlockTimes: resolveBlockTimes,
    getAsset: getAsset,
    getBlock: getBlock
};
