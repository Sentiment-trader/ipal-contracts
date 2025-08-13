import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { KnowledgeMarket, MockERC721 } from "../../typechain-types";

describe("KnowledgeMarket", function () {
  let knowledgeMarket: KnowledgeMarket;
  let mockNft: MockERC721;
  let owner: SignerWithAddress;
  let vaultOwner: SignerWithAddress;
  let user: SignerWithAddress;
  let anotherUser: SignerWithAddress;
  let coOwner: SignerWithAddress;

  const VAULT_ID = "vault123";
  const IMAGE_URL = "https://example.com/image.jpg";
  const PRICE = ethers.parseEther("0.1"); // 0.1 ETH
  const EXPIRATION_DURATION = 86400; // 1 day in seconds
  const CO_OWNER_SHARE = ethers.toBigInt(500); // 5% share for co-owner 

  beforeEach(async function () {
    [owner, vaultOwner, user, anotherUser, coOwner] = await ethers.getSigners();

    // Deploy mock NFT contract
    const MockERC721 = await ethers.getContractFactory("MockERC721");
    mockNft = await MockERC721.deploy();
    await mockNft.waitForDeployment();

    // Deploy knowledge market contract
    const KnowledgeMarket = await ethers.getContractFactory("KnowledgeMarket");
    knowledgeMarket = await KnowledgeMarket.deploy();
    await knowledgeMarket.waitForDeployment();

    const plataformFee = 1200; // 12% platform fee
    const treasury = owner.address; // Set the treasury address to the owner's address
    await knowledgeMarket.initialize(treasury, plataformFee);

    // Register vault
    await knowledgeMarket.connect(vaultOwner).registerVault(VAULT_ID);

    // Mint NFT to user
    await mockNft.mint(user.address, 1);
  });

  describe("Subscription Management", function () {
    it("Should allow setting a subscription", async function () {
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );

      const subscriptions = await knowledgeMarket.getVaultOwnerSubscriptions(vaultOwner.address);
      const platformFee = await knowledgeMarket.platformFeePercent();
      const platformTreasury = await knowledgeMarket.platformTreasury();

      expect(subscriptions.length).to.equal(1);
      expect(subscriptions[0].vaultId).to.equal(VAULT_ID);
      expect(subscriptions[0].imageURL).to.equal(IMAGE_URL);
      expect(subscriptions[0].price).to.equal(PRICE);
      expect(subscriptions[0].expirationDuration).to.equal(EXPIRATION_DURATION);
      expect(subscriptions[0].coOwner).to.equal(coOwner.address);
      expect(subscriptions[0].splitFee).to.equal(CO_OWNER_SHARE);

      expect(platformFee).to.equal(1200); // 12% platform fee
      expect(platformTreasury).to.equal(owner.address); // Treasury should be set to owner's address
    });

    it("Should allow updating a subscription", async function () {
      // First set a subscription
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );

      // Then update it
      const NEW_PRICE = ethers.parseEther("0.2"); // New price
      const NEW_EXPIRATION_DURATION = 172800; // 2 days in seconds
      const NEW_IMAGE_URL = "https://example.com/new_image.jpg";
      const NEW_CO_OWNER_SHARE = ethers.toBigInt(1000); // 10% share for co-owner

      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        NEW_PRICE,
        NEW_EXPIRATION_DURATION,
        NEW_IMAGE_URL,
        coOwner.address,
        NEW_CO_OWNER_SHARE
      );

      const accessControl = await knowledgeMarket.getAccessControl(vaultOwner.address, VAULT_ID);
      expect(accessControl.price).to.equal(NEW_PRICE);
      expect(accessControl.expirationDuration).to.equal(NEW_EXPIRATION_DURATION);
      expect(accessControl.splitFee).to.equal(NEW_CO_OWNER_SHARE);
    });

    it("Should allow deleting a subscription", async function () {
      // First set a subscription
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );

      // Then delete it
      await knowledgeMarket.connect(vaultOwner).deleteSubscription(VAULT_ID);

      const subscriptions = await knowledgeMarket.getVaultOwnerSubscriptions(vaultOwner.address);
      expect(subscriptions.length).to.equal(0);
    });

    it("Should use default image URL when none provided", async function () {
      // Set subscription with empty image URL
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        "", // Empty image URL
        coOwner.address,
        CO_OWNER_SHARE
      );

      // Mint with this subscription
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );

      const tokenId = await knowledgeMarket.totalSupply() - 1n;
      
      // Check tokenURI contains the default image
      const tokenURI = await knowledgeMarket.tokenURI(tokenId);
      const base64 = tokenURI.split(',')[1];
      const json = atob(base64); // or Buffer.from(base64, 'base64').toString()

      expect(json).to.include("https://arweave.net/"); // Part of the DEFAULT_IMAGE_URL
    });

    it("Should emit SubscriptionCreated event", async function () {
      await expect(knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      ))
      .to.emit(knowledgeMarket, "SubscriptionCreated")
      .withArgs(vaultOwner.address, VAULT_ID, PRICE, EXPIRATION_DURATION, coOwner.address, CO_OWNER_SHARE);
    });

    it("Should emit SubscriptionDeleted event", async function () {
      // First set a subscription
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );

      // Then delete it and check for event
      await expect(knowledgeMarket.connect(vaultOwner).deleteSubscription(VAULT_ID))
        .to.emit(knowledgeMarket, "SubscriptionDeleted")
        .withArgs(vaultOwner.address, VAULT_ID);
    });

    it("Should reject empty vaultId", async function () {
      await expect(
        knowledgeMarket.connect(vaultOwner).setSubscription(
          "", // Empty vaultId
          PRICE,
          EXPIRATION_DURATION,
          IMAGE_URL,
          coOwner.address,
          CO_OWNER_SHARE
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "EmptyVaultId");
    });

    it("Should reject co-owner same address vault owner", async function () {
      await expect(
        knowledgeMarket.connect(vaultOwner).setSubscription(
          VAULT_ID,
          PRICE,
          EXPIRATION_DURATION,
          IMAGE_URL,
          vaultOwner.address,
          CO_OWNER_SHARE
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "SameCoOwner");
    });

    it ("Should reject invalid fee percentage to co-owner", async function () {
      await expect(
        knowledgeMarket.connect(vaultOwner).setSubscription(
          VAULT_ID,
          PRICE,
          EXPIRATION_DURATION,
          IMAGE_URL,
          coOwner.address,
          10001 // Invalid fee percentage
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "InvalidFee");
    });

    it ("Should use 100% share for co-owner", async function () {
      // Set subscription with 100% share for co-owner
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        10000 // 100% share
      );
      const subscriptions = await knowledgeMarket.getVaultOwnerSubscriptions(vaultOwner.address);
      const subscription = subscriptions.find(s => s.vaultId === VAULT_ID);
      expect(subscription).to.not.be.undefined;
      expect(subscription!.splitFee).to.equal(10000); // 100% share
      expect(subscription!.coOwner).to.equal(coOwner.address);
    });

    it("Should allow free NFTs with zero price", async function () {
      // Set subscription with zero price
      await knowledgeMarket.connect(vaultOwner).setSubscription(
       VAULT_ID,
        0, // Zero price
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );

      const subscriptions = await knowledgeMarket.getVaultOwnerSubscriptions(vaultOwner.address);
      const freeSubscription = subscriptions.find(s => s.vaultId === VAULT_ID);
      expect(freeSubscription).to.not.be.undefined;
      expect(freeSubscription!.price).to.equal(0);
      
      // Test minting a free NFT
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: 0 }
      );
      
      // Check the user has access
      const [hasAccess] = await knowledgeMarket['hasAccess(address,string,address)'](
        vaultOwner.address, 
        VAULT_ID, 
        user.address
      );
      expect(hasAccess).to.be.true;
    });

    it("Should accept zero duration", async function () {
      await knowledgeMarket.connect(vaultOwner).setSubscription(
          VAULT_ID,
          PRICE,
          0, // Zero duration
          IMAGE_URL,
          coOwner.address,
          CO_OWNER_SHARE
      );

      const subscriptions = await knowledgeMarket.getVaultOwnerSubscriptions(vaultOwner.address);
      const subscription = subscriptions.find(s => s.vaultId === VAULT_ID);
      expect(subscription).to.not.be.undefined;
      expect(subscription!.expirationDuration).to.equal(0); // Zero duration accepted
    });

    it("Should reject empty vaultId when deleting", async function () {
      await expect(
        knowledgeMarket.connect(vaultOwner).deleteSubscription("")
      ).to.be.revertedWithCustomError(knowledgeMarket, "EmptyVaultId");
    });

    it("Should not do anything when deleting non-existent subscription", async function () {
      // Delete a subscription that doesn't exist
      await knowledgeMarket.connect(vaultOwner).deleteSubscription("nonexistent");
      
      // Verify no changes
      const subscriptions = await knowledgeMarket.getVaultOwnerSubscriptions(vaultOwner.address);
      expect(subscriptions.length).to.equal(0);
    });

    it("Should fail if vault id is not registered", async function () {
      await expect(
        knowledgeMarket.connect(vaultOwner).setSubscription(
          "nonexistentVault",
          PRICE,
          EXPIRATION_DURATION,
          IMAGE_URL,
          coOwner.address,
          CO_OWNER_SHARE
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "NotVaultOwner");
    });

    it("Should fail if vault is already registered", async function () {
      await expect(
        knowledgeMarket.connect(vaultOwner).registerVault(VAULT_ID)
      ).to.be.revertedWithCustomError(knowledgeMarket, "AlreadyHasRegistered");
    });

    it("Should fail trying to register a vault with empty ID", async function () {
      await expect(
        knowledgeMarket.connect(vaultOwner).registerVault("")
      ).to.be.revertedWithCustomError(knowledgeMarket, "EmptyVaultId");
    });

    it("Should fail if vault owner tries to set subscription for another vault that they don't own", async function () {
      // Register another vault
      await knowledgeMarket.connect(vaultOwner).registerVault("anotherVault");

      // Try to set subscription for another vault
      await expect(
        knowledgeMarket.connect(anotherUser).setSubscription(
          "anotherVault",
          PRICE,
          EXPIRATION_DURATION,
          IMAGE_URL,
          coOwner.address,
          CO_OWNER_SHARE
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "NotVaultOwner");
    });

  });

  describe("Minting", function () {
    beforeEach(async function () {
      // Set up a subscription first
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );
    });

    it("Should allow minting with different users", async function () {
      //fist user
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );

      const tokenId1 = await knowledgeMarket.totalSupply() - 1n;
      const deal1 = await knowledgeMarket.dealInfo(tokenId1);
      expect(deal1.vaultOwner).to.equal(vaultOwner.address);
      expect(deal1.imageURL).to.equal(IMAGE_URL);
      expect(deal1.price).to.equal(PRICE);

      //secound user
      await knowledgeMarket.connect(anotherUser).mint(
        vaultOwner.address,
        VAULT_ID,
        anotherUser.address,
        { value: PRICE }
      );

      const tokenId2 = await knowledgeMarket.totalSupply() - 1n;
      const deal2 = await knowledgeMarket.dealInfo(tokenId2);
      expect(deal2.vaultOwner).to.equal(vaultOwner.address);
      expect(deal2.imageURL).to.equal(IMAGE_URL);
      expect(deal2.price).to.equal(PRICE);
    });

    it("Should allow minting with correct payment", async function () {
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );

      const tokenId = await knowledgeMarket.totalSupply() - 1n;
      const deal = await knowledgeMarket.dealInfo(tokenId);
      expect(deal.vaultOwner).to.equal(vaultOwner.address);
      expect(deal.imageURL).to.equal(IMAGE_URL);
      expect(deal.price).to.equal(PRICE);
    });

    it("Should send 12% platform fee to the platformTreasury", async function () {
      const treasuryAddress = await knowledgeMarket.platformTreasury();
      const initialBalance = await ethers.provider.getBalance(treasuryAddress);

      const PLATFORM_FEE = await knowledgeMarket.platformFeePercent(); // 1200 (12%)

      const tx = await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );
      
      await tx.wait();

      const finalBalance = await ethers.provider.getBalance(treasuryAddress);
      const expectedFee = (PRICE * PLATFORM_FEE) / 10000n;
      expect(finalBalance - initialBalance).to.equal(expectedFee);
    });

    it("Should send correct creator amount to the vaultOwner", async function () {
      const vaultOwnerInitialBalance = (await ethers.provider.getBalance(vaultOwner.address));
      const PLATFORM_FEE = await knowledgeMarket.platformFeePercent();

      const tx = await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );
      await tx.wait();

      const vaultOwnerFinalBalance = (await ethers.provider.getBalance(vaultOwner.address));

      const expectedPlatformFee = (PRICE * PLATFORM_FEE) / 10000n;
      const expectedCreatorAmount = PRICE - expectedPlatformFee;
      const expectedAmount = vaultOwnerFinalBalance - vaultOwnerInitialBalance;

      if (CO_OWNER_SHARE > 0) {
        const coOwnerShare = (expectedCreatorAmount * CO_OWNER_SHARE) / 10000n;
        const expectedCreatorFinalAmount = expectedCreatorAmount - coOwnerShare;
        expect(expectedAmount).to.equal(expectedCreatorFinalAmount);
      } else {
        expect(expectedAmount).to.equal(expectedCreatorAmount);
      }
    });

    it("Should fail if payment amount is incorrect", async function () {
      const wrongPrice = PRICE - ethers.parseEther("0.01"); // Less than required price
      await expect(
        knowledgeMarket.connect(user).mint(
          vaultOwner.address,
          VAULT_ID,
          user.address,
          { value: wrongPrice }
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "InsufficientFunds");
    });

    it("Should emit AccessGranted event", async function () {
      const tx = knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );

      const tokenId = await knowledgeMarket.totalSupply();
      
      await expect(tx)
        .to.emit(knowledgeMarket, "AccessGranted")
        .withArgs(vaultOwner.address, VAULT_ID, user.address, tokenId, PRICE);
    });

    it("Should fail with zero address for vaultOwner", async function () {
      await expect(
        knowledgeMarket.connect(user).mint(
          ethers.ZeroAddress,
          VAULT_ID,
          user.address,
          { value: PRICE }
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "ZeroAddress");
    });

    it("Should fail with zero address for receiver", async function () {
      await expect(
        knowledgeMarket.connect(user).mint(
          vaultOwner.address,
          VAULT_ID,
          ethers.ZeroAddress,
          { value: PRICE }
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "ZeroAddress");
    });

    it("Should fail with empty vaultId", async function () {
      await expect(
        knowledgeMarket.connect(user).mint(
          vaultOwner.address,
          "",
          user.address,
          { value: PRICE }
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "EmptyVaultId");
    });

    it("Should fail if user already has access", async function () {
      // First mint the access NFT
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );

      // Then try to mint again
      await expect(
        knowledgeMarket.connect(user).mint(
          vaultOwner.address,
          VAULT_ID,
          user.address,
          { value: PRICE }
        )
      ).to.be.revertedWithCustomError(knowledgeMarket, "AlreadyHasActiveAccess");
    });

    it("Should block transfer if within LOCK_PERIOD after mint", async function () {
      const LOCK_PERIOD = 86400; // 1 day in seconds
      // Set up a subscription first
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );

      const tokenId = await knowledgeMarket.totalSupply() - 1n;
      const deal = await knowledgeMarket.dealInfo(tokenId);
      expect(deal.vaultOwner).to.equal(vaultOwner.address);
      expect(deal.imageURL).to.equal(IMAGE_URL);
      expect(deal.price).to.equal(PRICE);

      // Try to transfer the NFT immediately
      await expect(
        knowledgeMarket.connect(user).transferFrom(user.address, coOwner.address, tokenId)
      ).to.be.revertedWithCustomError(knowledgeMarket,"TransferLocked");

      // Try to transfer the NFT after almost 1 day
      await ethers.provider.send("evm_increaseTime", [LOCK_PERIOD - 5]);
      await ethers.provider.send("evm_mine", []);

      await expect(
        knowledgeMarket.connect(user).transferFrom(user.address, coOwner.address, tokenId)
      ).to.be.revertedWithCustomError(knowledgeMarket,"TransferLocked");

      // Try to transfer the NFT after 1 day
      await ethers.provider.send("evm_increaseTime", [LOCK_PERIOD - 5]);
      await ethers.provider.send("evm_mine", []);

      // Now it should allow
      await knowledgeMarket.connect(user).transferFrom(user.address, coOwner.address, tokenId);
    });
  });

  describe("Access Control", function () {
    beforeEach(async function () {
      // Set up a subscription first
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );
    });

    it("Should grant access after minting", async function () {
      // User mints the access NFT
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );

      // Check if the user has access to any of the vault owner's resources
      const hasGeneralAccess = await knowledgeMarket['hasAccess(address,address)'](vaultOwner.address, user.address);
      expect(hasGeneralAccess).to.be.true;
    });

    it("Should not grant access without minting", async function () {
      // Check access without minting
      const hasGeneralAccess = await knowledgeMarket['hasAccess(address,address)'](vaultOwner.address, user.address);
      expect(hasGeneralAccess).to.be.false;
    });

    it("Should verify access for specific vault", async function () {
      // User mints the access NFT
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );

      // Check if the user has access to the specific vault
      const [hasSpecificAccess] = await knowledgeMarket['hasAccess(address,string,address)'](
        vaultOwner.address, 
        VAULT_ID, 
        user.address
      );
      expect(hasSpecificAccess).to.be.true;
    });

    it("Should return false for zero addresses", async function () {
      // Check access with zero address for vaultOwner
      const hasGeneralAccess1 = await knowledgeMarket['hasAccess(address,address)'](
        ethers.ZeroAddress, 
        user.address
      );
      expect(hasGeneralAccess1).to.be.false;

      // Check access with zero address for customer
      const hasGeneralAccess2 = await knowledgeMarket['hasAccess(address,address)'](
        vaultOwner.address, 
        ethers.ZeroAddress
      );
      expect(hasGeneralAccess2).to.be.false;
    });
  });

  describe("TokenURI", function() {
    beforeEach(async function () {
      // Set up a subscription first
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );

      // Mint an NFT
      await knowledgeMarket.connect(user).mint(
        vaultOwner.address,
        VAULT_ID,
        user.address,
        { value: PRICE }
      );
    });

    it("Should return valid tokenURI with expected metadata", async function() {
      const tokenId = await knowledgeMarket.totalSupply() - 1n;
      const tokenURI = await knowledgeMarket.tokenURI(tokenId);
      const base64 = tokenURI.split(',')[1];
      const json = atob(base64);
      
      // Check that the URI contains expected fields
      expect(json).to.include(VAULT_ID);
      expect(json).to.include(IMAGE_URL);
      expect(json).to.include("knowledge vault");
    });
  });

  describe("getVaultOwnerSubscriptions", function() {
    it("Should reject zero address", async function() {
      await expect(
        knowledgeMarket.getVaultOwnerSubscriptions(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(knowledgeMarket, "ZeroAddress");
    });

    it("Should return empty array for vault owner with no subscriptions", async function() {
      const subscriptions = await knowledgeMarket.getVaultOwnerSubscriptions(vaultOwner.address);
      expect(subscriptions.length).to.equal(0);
    });

    it("Should return multiple subscriptions when vault owner has many", async function() {
      // Add first subscription
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        VAULT_ID,
        PRICE,
        EXPIRATION_DURATION,
        IMAGE_URL,
        coOwner.address,
        CO_OWNER_SHARE
      );

      // register another vault
      await knowledgeMarket.connect(vaultOwner).registerVault("vault456");
      
      // Add second subscription
      await knowledgeMarket.connect(vaultOwner).setSubscription(
        "vault456",
        PRICE * 2n,
        EXPIRATION_DURATION * 2,
        "https://example.com/image2.jpg",
        coOwner.address,
        CO_OWNER_SHARE
      );
      
      const subscriptions = await knowledgeMarket.getVaultOwnerSubscriptions(vaultOwner.address);
      expect(subscriptions.length).to.equal(2);
    });
  });
}); 