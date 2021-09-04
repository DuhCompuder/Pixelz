const { ethers } = require('hardhat');
const { expect } = require("chai");

describe('Pixelz', function () {
  let contract;
  let owner, addr1, addr2, addr3;

  beforeEach(async function() {
    const Pixelz = await ethers.getContractFactory("Pixelz");
    contract = await Pixelz.deploy("ipfs://");
    await contract.deployed();

    [owner, addr1, addr2, addr3] = await ethers.getSigners();
  })
  it('Should have the correct symbol', async function () {
    const symbol = await contract.symbol();
    expect(symbol).to.equal("PIXELZ");
  });
  it('Should have started the sale', async function () {
    let saleStatus;
    saleStatus = await contract.hasSaleStarted();
    if (!saleStatus) {
      await contract.startSale()
      saleStatus = await contract.hasSaleStarted();
    }
    expect(saleStatus).to.equal(true);
  });
  it('Should have started the sale', async function () {
    let saleStatus;
    await contract.startSale()
    saleStatus = await contract.hasSaleStarted();
    // console.log("sale status prior to unpause: ", saleStatus)
    if (saleStatus) {
      await contract.pauseSale()
      saleStatus = await contract.hasSaleStarted();
    }
    expect(saleStatus).to.equal(false);
  });
  it('Let user adopt a Pixelz nft', async function () {
    let saleStatus;
    saleStatus = await contract.hasSaleStarted();
    if (!saleStatus) {
      await contract.startSale()
      saleStatus = await contract.hasSaleStarted();
    }
    // console.log(saleStatus)
    let costOfPixelz = await contract.calculatePrice()
    let numPurchased = 1;
    await contract.connect(addr1).adoptPixelz(numPurchased, {from: addr1.address, value: ethers.utils.parseUnits("0.02", 18) })
  });

  // try {
    
  //   throw new Error("did not work")
  // } catch (e) {
  //   console.log(e.message)
  // }
});

   
//     [owner, addr1, addr2, addr3] = await ethers.getSigners();
//     await contract.connect(owner).transfer(addr2.address, 50);
//     // const ownerBalance = await contract.balanceOf(owner.address);
//     // console.log("Owner balance: ",ownerBalance);
//     console.log(contract);


// Test these functions

// 'MAX_PIXELZ()': [Function (anonymous)],
// 'METADATA_PROVENANCE_HASH()': [Function (anonymous)],
// 'R()': [Function (anonymous)],
// 'adoptPixelz(uint256)': [Function (anonymous)],
// 'approve(address,uint256)': [Function (anonymous)],
// 'balanceOf(address)': [Function (anonymous)],
// 'baseURI()': [Function (anonymous)],
// 'calculatePrice()': [Function (anonymous)],
// 'calculatePriceForToken(uint256)': [Function (anonymous)],
// 'getApproved(uint256)': [Function (anonymous)],
// 'hasSaleStarted()': [Function (anonymous)],
// 'isApprovedForAll(address,address)': [Function (anonymous)],
// 'name()': [Function (anonymous)],
// 'owner()': [Function (anonymous)],
// 'ownerOf(uint256)': [Function (anonymous)],
// 'pauseSale()': [Function (anonymous)],
// 'renounceOwnership()': [Function (anonymous)],
// 'reserveGiveaway(uint256)': [Function (anonymous)],
// 'safeTransferFrom(address,address,uint256)': [Function (anonymous)],      
// 'safeTransferFrom(address,address,uint256,bytes)': [Function (anonymous)],  'setApprovalForAll(address,bool)': [Function (anonymous)],
// 'setBaseURI(string)': [Function (anonymous)],
// 'setProvenanceHash(string)': [Function (anonymous)],
// 'startSale()': [Function (anonymous)],
// 'supportsInterface(bytes4)': [Function (anonymous)],
// 'symbol()': [Function (anonymous)],
// 'tokenByIndex(uint256)': [Function (anonymous)],
// 'tokenOfOwnerByIndex(address,uint256)': [Function (anonymous)],
// 'tokenURI(uint256)': [Function (anonymous)],
// 'tokensOfOwner(address)': [Function (anonymous)],
// 'totalSupply()': [Function (anonymous)],
// 'transferFrom(address,address,uint256)': [Function (anonymous)],
// 'transferOwnership(address)': [Function (anonymous)],
// 'withdrawAll()': [Function (anonymous)],