const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')

const CID = require('cids')
const ipfsClient = require('ipfs-http-client')
const all = require('it-all')
const uint8ArrayConcat = require('uint8arrays/concat')
const uint8ArrayToString = require('uint8arrays/to-string')
const {BigNumber} = require('ethers')


const { loadDeploymentInfo } = require('./deploy')

// The getconfig package loads configuration from files located in the the `config` directory.
// See https://www.npmjs.com/package/getconfig for info on how to override the default config for
// different environments (e.g. testnet, mainnet, staging, production, etc).
const config = require('getconfig')

// ipfs.add parameters for more deterministic CIDs
const ipfsAddOptions = {
  cidVersion: 1,
  hashAlg: 'sha2-256'
}

/**
 * Construct and asynchronously initialize a new Pixelz instance.
 * @returns {Promise<Pixelz>} a new instance of Pixelz, ready to mint NFTs.
 */
 async function MakePixelz() {
    const m = new Pixelz()
    await m.init()
    return m
}

/**
 * Pixelz is the main object responsible for storing NFT data and interacting with the smart contract.
 * Before constructing, make sure that the contract has been deployed and a deployment
 * info file exists (the default location is `pixelz-deployment.json`)
 * 
 * Pixelz requires async initialization, so the Pixelz class (and its constructor) are not exported. 
 * To make one, use the async {@link MakePixelz} function.
 */
class Pixelz {
    constructor() {
        this.ipfs = null
        this.contract = null
        this.deployInfo = null
        this._initialized = false
    }

    async init() {
        if (this._initialized) {
            return
        }
        this.hardhat = require('hardhat')

        // The Pixelz object expects that the contract has already been deployed, with
        // details written to a deployment info file. The default location is `./pixelz-deployment.json`,
        // in the config.
        this.deployInfo = await loadDeploymentInfo()

        // connect to the smart contract using the address and ABI from the deploy info
        const {abi, address} = this.deployInfo.contract
        this.contract = await this.hardhat.ethers.getContractAt(abi, address)

        // create a local IPFS node
        this.ipfs = ipfsClient(config.ipfsApiUrl)

        this._initialized = true
    }


    //////////////////////////////////////////////
    // ------ NFT Creation
    //////////////////////////////////////////////

    /**
     * Create a new NFT from the given asset data.
     * 
     * @param {Buffer|Uint8Array} content - a Buffer or UInt8Array of data (e.g. for an image)
     * @param {object} options
     * @param {?string} path - optional file path to set when storing the data on IPFS
     * @param {?string} name - optional name to set in NFT metadata
     * @param {?string} description - optional description to store in NFT metadata
     * @param {?string} owner - optional ethereum address that should own the new NFT. 
     * If missing, the default signing address will be used.
     * 
     * @typedef {object} CreateNFTResult
     * @property {string} tokenId - the unique ID of the new token
     * @property {string} ownerAddress - the ethereum address of the new token's owner
     * @property {object} metadata - the JSON metadata stored in IPFS and referenced by the token's metadata URI
     * @property {string} metadataURI - an ipfs:// URI for the NFT metadata
     * @property {string} metadataGatewayURL - an HTTP gateway URL for the NFT metadata
     * @property {string} assetURI - an ipfs:// URI for the NFT asset
     * @property {string} assetGatewayURL - an HTTP gateway URL for the NFT asset
     * 
     * @returns {Promise<CreateNFTResult>}
     */
     async createNFTFromAssetData(content, options) {
        // assign or create a new directory to store all nft data to a server location
        const { tokenId } = options
        const __dirname = './nft';

        if (!fs.existsSync(__dirname)){
            fs.mkdirSync(__dirname);
        }
        let tokenId;
        //Mod this for multiples
        tokenId = await this.contract.totalSupply()
        //Add data to Server
        await fsp.writeFile(__dirname + `/${tokenId + 1}`, content)
        const filePath = options.path || 'asset.bin'
        const basename = path.basename(filePath)
        //location of nft image file
        const assetURI = __dirname + basename
        // make the NFT metadata JSON
        const metadata = await this.makeNFTMetadata(assetURI, options)

        const metadataURI = __dirname + `/${tokenId}-` + 'metadata.json'
        await fsp.writeFile(metadataURI, JSON.stringify(metadata))

        // get the address of the token owner from options, or use the default signing address if no owner is given
        let ownerAddress = options.owner
        if (!ownerAddress) {
            ownerAddress = await this.defaultOwnerAddress()
        }

        // mint a new token referencing the metadata URI
        const tokenId = await this.purchasePixelzNFT(ownerAddress, metadataURI)

        // format and return the results
        return {
            tokenId,
            ownerAddress,
            metadata,
            assetURI,
            metadataURI,
            assetGatewayURL: makeGatewayURL(assetURI),
            metadataGatewayURL: makeGatewayURL(metadataURI),
        }
    }
        /**
     * Create a new NFT from an asset file at the given path.
     * 
     * @param {string} filename - the path to an image file or other asset to use
     * @param {object} options
     * @param {?string} name - optional name to set in NFT metadata
     * @param {?string} description - optional description to store in NFT metadata
     * @param {?string} owner - optional ethereum address that should own the new NFT. 
     * If missing, the default signing address will be used.
     * 
     * @returns {Promise<CreateNFTResult>}
     */
    async createNFTFromAssetFile(filename, options) {
        const content = await fsp.readFile(filename)
        return this.createNFTFromAssetData(content, {...options, path: filename})
    }
    
    /**
     * Helper to construct metadata JSON for 
     * @param {string} assetCid - IPFS URI for the NFT asset
     * @param {object} options
     * @param {?string} name - optional name to set in NFT metadata
     * @param {?string} description - optional description to store in NFT metadata
     * @returns {object} - NFT metadata object
     */
    async makeNFTMetadata(assetURI, options) {
        const {name, description} = options;
        // assetURI = ensureIpfsUriPrefix(assetURI) //uncomment for IPFS
        return {
            name,
            description,
            image: assetURI
        }
    }
    // //////////////////////////////////////////////
    // // --------- Smart contract interactions
    // //////////////////////////////////////////////
    
    // purchasing Pixelz with max number of 20
    async purchasePixelzNFT(num) {
        if (num > 20 || num < 1) {
            throw 'Number must be between 1 to 20 inclusive';
        }
        const tx = await this.contract.adoptPixelz(num)
        const receipt = await tx.wait()
        
        for (const event of receipt.events) {
            if (event.event !== 'Transfer') {
                console.log('ignoring unknown event type ', event.event)
                continue
            }
            return event.args.tokenId.toString()
        }

        throw new Error('unable to get token id')
    }
}