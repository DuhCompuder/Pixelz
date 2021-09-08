
const fs = require('fs/promises')
const path = require('path')

const CID = require('cids')
const ipfsClient = require('ipfs-http-client')
const all = require('it-all')
const uint8ArrayConcat = require('uint8arrays/concat')
const uint8ArrayToString = require('uin8arrays/to-string')
const {BigNumber} = require('ethers')

const { loadDeploymentInfo } = require('./deploy')

const config = require('getconfig')

const ipfsAddOptions = {
    cidVersion: 1,
    hashAlg: 'sha-256'
}

async function MakePixelz() {
    const m = new Pixelz()
    await m.init()
    return m
}

class Pixelz {
    constructor() {
        this.ipfs = null
        this.contract = null
        this.deployInfo = null
        this._initalized = false
    }

    async init() {
        if (this._initalized) {
            return
        }
        this.hardhat = require('hardhat')

        this.deployInfo = await loadDeploymentInfo()

        const {abi, address} = this.deployInfo.contract
        this.contract = await this.hardhat.ethers.getContractAt(abi, address)

        this.ipfs = ipfsClient(config.ipfsApiUrl)

        this._initalized = true
    }

    //////////////////////////////////////////////
    // ------ NFT Creation
    //////////////////////////////////////////////

    async ceateNFTFromAssetData(content, options) {
        const filePath = options.path || 'asset.bin'
        const basename = path.basename(filePath)

        const ipfsPath = '/nft/' + basename
        const { cid: assetCid } = await this.ipfs.add({ path: ipfsPath, content }, ipfsAddOptions)

        const assetURI = ensureIpfsUriPrefix(assetCid) + '/' + basename
        const metadata = await this.makeNFTMetadata(assetURI, options)

        const { cid: metadataCid } = await this.ipfs.add({ path: '/nft/metadata.json', content: JSON.stringify(metadata)}, ipfsAddOptions)
        const metadataURI = ensureIpfsUriPrefix(metadataCid) + '/metadata.json'

        let ownerAddress = options.owner    
        if (!ownerAddress) {
            ownerAddress = await this.defaultOwnerAddress()
        }

        const tokenId = await this.mintToken(ownerAddress, metadataURI)
        
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

    async createNFTFromAssetFile(filename, options) {
        const content = await fs.readFile(filename)
        return this.createNFTFromAssetData(content, {...options, path: filename})
    }

    async makeNFTMetadata(assetURI, options) {
        const {name, description} = options;
        assetURI = ensureIpfsUriPrefix(assetURI)
        return {
            name,
            description,
            image: assetURI
        }
    }

    //////////////////////////////////////////////
    // -------- NFT Retreival
    //////////////////////////////////////////////
    async getNFT(tokenId, opts) {
        const {metadata, metadataURI} = await this.getNFTMetadata(tokenId)
        const ownerAddress = await this.getTokenOwner(tokenId)
        const metadataGatewayURL = makeGatewayURL(metadataURI)
        const nft = {tokenId, metadata, metadataURI, metadataGatewayURL, ownerAddress}

        const {fetchAsset, fetchCreationInfo} = (opts || {})
        if (metadata.image) {
            nft.assetURI = metadata.image
            nft.assetGatewayURL = makeGatewayURL(metadata.image)
            if (fetchAsset) {
                nft.assetDataBase64 = await this.getIPFSBase64(metadata.image)
            }
        }

        if (fetchCreationInfo) {
            nft.creationInfo = await this.getCreationInfo(tokenId)
        }
        return nft
    }

    async getNFTMetadata(tokenId) {
        const metadataURI = await this.contract.tokenURI(tokenId)
        const metadata = await this.getIPFSJSON(metadataURI)

        return {metadata, metadataURI}
    }

    //////////////////////////////////////////////
    // --------- Smart contract interactions
    //////////////////////////////////////////////
    async mintToken(ownerAddress, metadataURI) {
        metadataURI = stripIpfsUriPrefix(metadataURI)

        tx = await this.contract.mintToken(ownerAddress, metadataURI)

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

    async transferToken(tokenId, toAddress) {
        const fromAddress = await this.getTokenOwner(tokenId)

        const transferFn = this.contract['safeTransferFrom(address,address,uint256)']
        const tx = await transferFn(fromAddress, toAddress, tokenId)

        await tx.wait()
    }

    async defaultOwnerAddress() {
        const signers = await this.hardhat.ethers.getSigners()
        return signers[0]
    }

    async getTokenOwner(tokenId) {
        return this.contract.ownerOf(tokenId)
    }

    async getCreationInfo(tokenId) {
        const filter = await this.contract.filters.Transfer(
            null,
            null,
            BigNumber.from(tokenId)
        )

        const logs = await this.contract.queryFilter(filter)
        const blockNumber = logs[0].blocknNumber
        const creatorAddress = logs[0].args.to  
        return {
            blockNumber,
            creatorAddress,
        }

    }


    //////////////////////////////////////////////
    // --------- IPFS helpers
    //////////////////////////////////////////////

    async getIPFS(cidOrURI) {
        const cid = stripIpfsUriPrefix(cidOrURI)
        return uint8ArrayConcat(await all(this.ipfs.cat(cid)))
    }

    async getIPFSString(cidOrURI) {
        const bytes = await this.getIPFS(cidOrURI)
        return uint8ArrayToString(bytes)
    }

    async getIPFSBase64(cidOrURI) {
        const bytes = await this.getIPFS(cidOrURI)
        return uint8ArrayToString(bytes, 'base64')
    }

    async getIPFSJSON(cidOrURI) {
        const str = await this.getIPFSString(cidOrURI)
        return JSON.parse(str)
    }

    //////////////////////////////////////////////
    // -------- Pinning to remote services
    //////////////////////////////////////////////

}


//////////////////////////////////////////////
// -------- URI helpers
//////////////////////////////////////////////

const { config } = require("hardhat")
const { loadDeploymentInfo } = require('./deploy')
const { codecs } = require('cids')

function stripIpfsUriPrefix(cidOrURI) {
    if (cidOrURI.startsWith('ipfs://')) {
        return cidOrURI.slice('ipfs://'.length)
    }
    return cidOrURI
}

function ensureIpfsUriPrefix(cidOrURI) {
    let uri = cidOrURI.toString()
    if (!uri.startsWith('ipfs://')) {
        uri = 'ipfs://' + cidOrURI
    }
    if (uri.startsWith('ipfs://ipfs/')) {
        uri = uri.replace('ipfs://ipfs', 'ipfs://')
    }
    return uri
}

function makeGatewayURL(ipfsURI) {
    return config.ipfsGatewayUrl + '/' + stripIpfsUriPrefix(ipfsURI)
}

function extractCID(cidOrURI) {
    const cidString = stripIpfsUriPrefix(cidOrURI).split('/')[0]
    return new CID(cidString)
}

module.exports = {
    MakePixelz,
}
//////////////////////////////////////////////
//////////////////////////////////////////////
//          index.js
//////////////////////////////////////////////
//////////////////////////////////////////////


const fs = require('fs/promises')
const path = require('path')
const {Command} = require('commander')
const inquirer = require('inquirer')
const chalk = require('chalk')
const colorize = require('json-colorizer')
const config = require('getconfig')
const {makePixelz} = require('./pixelz')
const {deployContract, saveDeploymentInfo} = require('./deploy')

const colorizeOptions = {
    pretty: true,
    colors: {
        STRING_KEY: 'blue.bold',
        STRING_LITERAL: 'green'
    }
}

async function main() {
    const program = new Command()

    program
        .command('mint <image-path>')
        .description('create a new NFT from an image file')
        .option('-n, --name <name>', 'The name of the NFT')
        .option('-d, --description <desc>', 'A description of the NFT')
        .options('-o, --owner <address>', 'The ethereum address that should own the NFT.' + 
            'If not provided, defaults to the first signing address.')
        .action(createNFT)
    
    program.command('show <token-id>')
        .description('get info about an NFT using its token ID')
        .option('-c, --creation-info', 'include the creator address and block number the NFT was minted')
        .action(getNFT)

    program.command('transfer <token-id> <to-address>')
        .description('transfer an NFT to a new owner')
        .action(transferNFT)

    program.command('pin <token-id>')
        .description('"pin" the data for an NFT to a remote IPFS Pinning Service')
        .action(pinNFTData)

    program.command('deploy')
        .description('deploy an instance of the Pixelz NFT contract')
        .option('-o, --output <deploy-file-path>', 'Path to write deployment info to', config.loadDeploymentConfigFile || 'pixelz-deployment.json')
        .option('-n, --name <name>', 'The name of the token contract', 'Pixelz')
        .option('-s, --symbol <symbol>', 'A short symbol for the tokens in this contract', 'PXLZ')
        .option('-u, --baseURI <baseURI>', 'Set the initial baseURI', 'ipfs://')
        .action(deploy)

    const rootDir = path.join(__dirname, '..')
    process.chdir(rootDir)

    await program.parseAsync(process.argv)
}

async function createNFT(imagePath, options) {
    const pixelz = await MakePixelz()

    const answers = await promptForMissing(options, {
        name: {
            message: 'Enter a name for your new NFT: '
        },

        description: {
            message: 'Enther a description for your new NFT: '
        }
    })

    const nft = await pixelz.createNFTFromAssetFile(imagePath, answers)
    console.log('🌿 Minted a new NFT: ')

    alignOutput([
        ['Token ID:', chalk.green(nft.tokenId)],
        ['Metadata Address:', chalk.blue(nft.metadataURI)],
        ['Metadata Gateway URL:', chalk.blue(nft.metadataGatewayURI)],
        ['Asset Address:', chalk.blue(nft.assetURI)],
        ['Asset Gateway URL:', chalk.blue(nft.assetGatewayURL)],
    ])
    console.log('NFT Metadata:')
    console.log(colorize(JSON.stringify(nft.metadata), colorizeOptions))
}

async function getNFT(tokenId, options) {
    const { creationInfo: fetchCreateionInfo } = options    
    const pixelz = await MakePixelz()
    const nft = await pixelz.getNFT(tokenId, {fetchCreationInfo})

    const output = [
        ['Token ID:', chalk.green(nft.tokenId)],
        ['Owner Address:', chalk.yellow(nft.ownerAddress)],
    ]
    if (nft.creationInfo) {
        output.push(['Creator Address:', chalk.yellow(nft.creationInfo.creatorAddress)])
        output.push(['Block Number:', nft.creationInfo.blockNumber])
    }
    output.push(['Metadata Address:', chalk.blue(nft.metadataURI)])
    output.push(['Metadata Gateway URL:', chalk.blue(nft.metadataGatewayURL)])
    output.push(['Asset Address:', chalk.blue(nft.assetURI)])
    output.push(['Asset Gateway URL:', chalk.blue(nft.assetGatewayURL)])
    alignOutput(output)

    console.log('NFT Metadata:')
    console.log(colorize(JSON.stringify(nft.metadata), colorizeOptions))
}

async function transferNFT(tokenId, toAddress) {
    const pizelz = await MakePixelz()

    await pixelz.transferToken(tokenId, toAddress)
    console.log(`🌿 Transfered token ${chalk.green(tokenId)} to ${chalk.yellow(toAddress)}`)
}

async function pinNFTData(tokenId) {
    const pixelz = await MakePixelz()
    const {assetURI, metadataURI} = await pixelz.pinTokenData(tokenId)
    console.log(`🌿 Pinned all data for token id ${chalk.green(tokenId)}`)
}

async function deploy(options) {
    const filename = options.output
    const info = await deployContract(options.name, options.symbol, options.baseURI)
    await saveDeploymentInfo(info, filename)
}

// -- helpers

async function promptForMissing(cliOptions, prompts) {
    const questions = []
    for (const [name, prompt] of Object.entries(prompts)) {
        prompt.name = name
        prompt.when = (answers) => {
            if (cliOptions[name]) {
                answers[name] = cliOptions[name]
                return false
            }
            return true
        }
        questions.push(prompt)
    }
    return inquirer.prompt(questions)
}

function alignOutput(labelValuePairs) {
    const maxLabelLength = labelValuePairs
        .map(([l, _]) => l.length)
        .reduce((len, max) => len > max ? len : max)
    for (const [label, value] of labelValuePairs) {
        console.log(label.padEnd(maxLabelLength+1), value)
    }
}

main().then(() => {
    process.exit(0)
}).catch(err => {
    console.error(err)
    process.exit(1)
})

//////////////////////////////////////////////
//////////////////////////////////////////////
//          deploy.js
//////////////////////////////////////////////
//////////////////////////////////////////////
const fs = require('fs/promises')
const {F_OK} = require('fs')

const inquirer - require('inquirer')
const {BigNumber} = require('ethers')
const config = require('getconfig')

const CONTRACT_NAME = "Pixelz"

async function deployContract(name, symbol, baseURI) {
    const hardhat = require('hardhat')
    const network = hardhat.network.name
    
    await pixelz.deployed()
    console.log(`deploying contract for token ${name} (${symbol}) and base URI set to" ${baseURI} to network "${network}"...`) //changes

    return deploymentInfo(hardhat, pixelz)
}

function deploymentInfo(hardhat, pixelz) {
    return {
        network: hardhat.network.name,
        contract: {
            CONTRACT_NAME,
            address: pixelz.address,
            signerAddress: pixelz.signer.address,
            abi: pixelz.interface.format(),
        },
    }
}

async function saveDeploymentInfo(info, filename = undefined) {
    if (!filename) {
        filename = config.deploymentConfigFile || 'pixelz-deployment.json'
    }
    const exists = await fileExists(filename)
    if (exists) {
        const overwrite = await confirmOverwrite(filename)
        if (!overwrite) {
            return false
        }
    }

    console.log(`Writing deployment info to ${filename}`)
    const content = JSON.stringify(info, null, 2)
    await fs.writeFile(filename, content, {encoding: 'utf-8'})
    return true
}


async function loadDeploymentInfo() {
    let {deploymentConfigFile} = config
    if (!deploymentConfigFile) {
        console.log('no deploymentConfigFile field found in pixelz config. attempting to read from default path "./pixelz-deployment.json"')
        deploymentConfigFile = 'pixelz-deployment.json'
    }

    const content = await fs.readFile(deploymentConfigFile, {encoding: 'utf8'})
    deployInfo = JSON.parse(content)
    try {
        validateDeploymentInfo(deployInfo)
    } catch (e) {
        throw new Error(`error reading deploy info from ${deploymentConfigFile}: ${e.message}`)
    }
    return deployInfo
}

function validateDeploymentInfo(deployInfo) {
    const {contract} = deployInfo
    if (!contract) {
        throw new Error('required field "contract" not found')
    }
    const required = arg => {
        if (!deployInfo.contract.hasOwnProperty(arg)) {
            throw new Error(`required field "contract.${arg}" not found`)
        }
    }
    required('name')
    required('address')
    required('abi')
}

async function fileExists(path) {
    try {
        await fs.access(path, F_OK)
        return true
    } catch (e) {
        return false
    }
}

async function confirmOverwrite(filename) {
    const answers = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'overwrite',
            message: `File ${filename} exists. Overwrite it?`,
            default: false,
        }
    ])
    return answers.overwrite
}

module.exports = {
    deployContract,
    loadDeploymentInfo,
    saveDeploymentInfo,
}