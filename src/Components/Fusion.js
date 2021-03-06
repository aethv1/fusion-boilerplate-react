import React from 'react';
import * as Web3 from 'web3';
import * as web3FusionExtend from 'web3-fusion-extend';
import * as BN from 'bignumber.js';

let _FSNASSETID = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
let _NETWORK = "wss://fusion-21649-test.morpheuslabs.io"
let _CHAINID = 2364;

let provider = new Web3.providers.WebsocketProvider(_NETWORK);
let web3 = new Web3(provider);
web3 = web3FusionExtend.extend(web3);

class Fusion extends React.Component {

    constructor(props) {
        super(props);

        this.state = {
            output: [],
            web3: false,
            account: undefined,
            usan: undefined,
            sendAssetTo: undefined,
            sendAssetAmount: undefined,
            selectedAssetBalance: undefined,
            createAssetName: undefined,
            createAssetSymbol: undefined,
            createAssetDecimals: undefined,
            createAssetTotalSupply: undefined,
            fsnBalance: '?',
            privateKey: undefined
        }
    }

    /**
     * Resolves the given Private Key into an account
     */
    async setAccount() {
        if (!this.state.privatekey) return

        let privateKey = this.state.privatekey.startsWith('0x')? this.state.privatekey : '0x' + this.state.privatekey;
        this.setState({privatekey: privateKey});

        let a = web3.eth.accounts.privateKeyToAccount(privateKey);
        console.log(a);
        this.setState({account: a});
        if (a.address) {
            this.userHasFsn(a.address);
        }
        this.addOutput(`Succesfully decrypted wallet. Your address is : ${a.address}`);
    }

    /**
     * Creates a BigNumber in wei based on the amount and decimals
     * @param amount
     * @param decimals
     * @returns BigNumber
     */
    makeBigNumber(amount, decimals) {
        // Allow .0
        if (amount.substr(0, 1) === ".") {
            let a = "0" + amount;
            amount = a;
        }
        let pieces = amount.split(".");
        let d = parseInt(decimals);
        if (pieces.length === 1) {
            amount = parseInt(amount);
            if (isNaN(amount) || amount < 0) {
                // error message
                return;
            }
            amount = new BN(amount + "0".repeat(parseInt(decimals)));
        } else if (pieces.length > 2) {
            return;
        } else if (pieces[1].length > d) {
            return;
        } else {
            let dec = parseInt(pieces[1]);
            let reg = new RegExp("^\\d+$"); // numbers only
            if (isNaN(pieces[1]) || dec < 0 || !reg.test(pieces[1])) {
                return;
            }
            dec = pieces[1];
            let declen = d - dec.toString().length;
            amount = parseInt(pieces[0]);
            if (isNaN(amount) || amount < 0) {
                // error message
                return;
            }
            amount = new BN(amount + dec + "0".repeat(parseInt(declen)));
        }
        return amount;
    };

    /**
     * Adds a message to the output screen
     * @param message
     */
    addOutput(message) {
        let d = new Date();
        let b = this.state.output;
        b.push(`[ ${d.getHours()}:${d.getMinutes()} ] | ${message}`);
        this.setState({output: b})
    }

    /**
     * @returns The address related to the notation
     */
    async getAddressByNotation() {
        let addr = await web3.fsn.getAddressByNotation(parseInt(this.state.usan));
        this.addOutput(`Return address for USAN ${this.state.usan} is ${addr}`);
    }

    /**
     * Checks whether the given address has FSN present
     * @param address
     */
    async userHasFsn(address) {
        let assets = await web3.fsn.allInfoByAddress(address);
        let ids = Object.keys(assets.balances);
        if (ids.includes(_FSNASSETID)) {
            let balance = await this.formatFsnBalance(assets.balances[_FSNASSETID]);
            this.addOutput(`This address has ${balance} FSN.`);
            this.setState({hasFsn: true, fsnBalance: balance})
        }
    }

    /**
     * Returns the formatted balance for FSN
     * @param amount
     * @returns Formatted FSN Balance
     */
    async formatFsnBalance(amount) {
        let fsn = await web3.fsn.getAsset(_FSNASSETID);
        let amountBN = new BN(amount.toString());
        let decimalsBN = new BN(this.countDecimals(fsn.Decimals).toString());
        return amountBN.div(decimalsBN).toString();
    }

    /**
     * Sends out FSN based on given input from the form
     */
    async sendAsset() {
        if (!this.state.sendAssetTo || !this.state.sendAssetAmount) return;
        let value = this.makeBigNumber(this.state.sendAssetAmount.toString(), 18);
        let payload = {
            from: this.state.account.address,
            to: this.state.sendAssetTo,
            value: value.toString(),
            asset: _FSNASSETID
        }
        console.log(payload);
        await web3.fsntx.buildSendAssetTx(payload).then((tx) => {
            console.log(tx);
            tx.from = this.state.account.address.toLowerCase();
            tx.chainId = parseInt(_CHAINID);
            return web3.fsn.signAndTransmit(tx, this.state.account.signTransaction)
                .then(txHash => {
                    this.addOutput(`Transaction Hash : ${txHash}`);
                });
        });
    }

    /**
     * Creates an asset based on given input
     */
    async createAsset() {
        if (!this.state.createAssetName ||
            !this.state.createAssetSymbol ||
            !this.state.createAssetDecimals ||
            !this.state.createAssetTotalSupply) return

        let totalSupplyString = this.state.createAssetTotalSupply.toString();
        let totalSupplyBN = this.makeBigNumber(totalSupplyString, this.state.createAssetDecimals);
        let totalSupplyBNHex = "0x" + totalSupplyBN.toString(16);

        let data = {
            from: this.state.account.address,
            name: this.state.createAssetName,
            symbol: this.state.createAssetSymbol,
            decimals: this.state.createAssetDecimals,
            total: totalSupplyBNHex
        };


        await web3.fsntx.buildGenAssetTx(data).then(tx => {
            tx.chainId = _CHAINID;
            let gasPrice = web3.utils.toWei(new web3.utils.BN(100), "gwei");
            tx.gasPrice = gasPrice.toString();
            return web3.fsn
                .signAndTransmit(tx, this.state.account.signTransaction)
                .then(txHash => {
                    this.addOutput(`Transaction Hash : ${txHash}`);
                });
        });

    }

    /**
     * Counts the amount of decimals, used to divide balance with in certain functions
     * @param decimals
     * @returns {number}
     */
    countDecimals = function (decimals) {
        let returnDecimals = '1';
        for (let i = 0; i < decimals; i++) {
            returnDecimals += '0';
        }
        return parseInt(returnDecimals);
    }


    render() {
        return (
            <div className={'container'}>
                <div className="row">
                    {!this.state.account ?
                        <div className={'col-3'}>
                            <h6>Decrypt Wallet</h6>
                            <hr/>
                            <div className="form-group">
                                <label>Private Key</label>
                                <input type="text" className="form-control" onChange={val => {
                                    this.setState({privatekey: val.target.value})
                                }}
                                       placeholder="Enter Private Key"/>
                            </div>
                            <button className="btn btn-primary" onClick={() => {
                                this.setAccount()
                            }}>Decrypt
                            </button>
                        </div>
                        : ''}
                </div>

                <div className="row mt-2">
                    <div className={'col-md-4'}>
                        <h6>Send Asset (FUSION)</h6>
                        <hr/>
                        <p>FSN Balance: {this.state.fsnBalance}</p>
                        <div className="form-group">
                            <label>To</label>
                            <input type="text" className="form-control" placeholder="Enter wallet address"
                                   onChange={val => {
                                       this.setState({sendAssetTo: val.target.value})
                                   }}/>
                            <small className="form-text text-muted">Enter a wallet address starting with 0x
                            </small>
                        </div>
                        <div className="form-group">
                            <label>Amount</label>
                            <input type="text" className="form-control" placeholder="Enter amount"
                                   onChange={val => {
                                       this.setState({sendAssetAmount: parseInt(val.target.value)})
                                   }}
                            />
                        </div>
                        <button className="btn btn-primary" onClick={() => {
                            this.sendAsset()
                        }}>Submit
                        </button>
                    </div>
                    <div className={'col-md-4'}>
                        <h6>Create Asset</h6>
                        <hr/>
                        <div className="form-group">
                            <label>Asset Name</label>
                            <input type="text" className="form-control" placeholder="Enter amount"
                                   onChange={val => {
                                       this.setState({createAssetName: val.target.value})
                                   }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Asset Symbol</label>
                            <input type="text" className="form-control" placeholder="Enter amount"
                                   onChange={val => {
                                       this.setState({createAssetSymbol: val.target.value})
                                   }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Decimals</label>
                            <input type="text" className="form-control" placeholder="Enter amount"
                                   onChange={val => {
                                       this.setState({createAssetDecimals: parseInt(val.target.value)})
                                   }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Total Supply</label>
                            <input type="text" className="form-control" placeholder="Enter amount"
                                   onChange={val => {
                                       this.setState({createAssetTotalSupply: parseInt(val.target.value)})
                                   }}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary" onClick={() => {
                            this.createAsset()
                        }}>Submit
                        </button>
                    </div>
                    <div className={'col-md-4'}>
                        <h6>Get Address By Notation</h6>
                        <hr/>
                        <div className="form-group">
                            <label>Short Account Number</label>
                            <input type="number" className="form-control" onChange={val => {
                                this.setState({usan: parseInt(val.target.value)})
                            }} placeholder="Enter wallet address"/>
                            <small className="form-text text-muted">Enter a USAN</small>
                        </div>
                        <button className="btn btn-primary" onClick={() => {
                            this.getAddressByNotation()
                        }}>Submit
                        </button>
                    </div>
                </div>
                <div className="row">
                    <div className="col-md-12">
                        <div className="jumbotron p-1 mt-2">
                            <small>OUTPUT</small>
                            <hr className="my-1"/>
                            {this.state.output ?
                                this.state.output.reverse().map((val, index) =>
                                        <p key= {index} className={'text-muted m-0'}>
                                            {val}
                                        </p>
                                )

                                : ''}
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}

export default Fusion;
