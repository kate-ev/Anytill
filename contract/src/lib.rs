//! Anytill receipt anchors.
//!
//! When Anytill's server has verified a payment (1Click status matches the signed quote, and the
//! USDC transfer to the merchant is read from NEAR), it hashes the receipt (SHA-256 of a canonical
//! JSON form) and anchors that hash here, keyed by receipt id. Anchors are write-once: nobody,
//! including the owner, can change or delete one. Anyone can read them with a free view call and
//! recompute the hash from a receipt to prove it was not edited afterwards.
//!
//! This contract is not in the money path. Payments settle through the NEAR Intents verifier
//! straight into the merchant's account; this only records proof of what was verified.

use near_sdk::store::LookupMap;
use near_sdk::{env, log, near, require, AccountId, PanicOnDefault};

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Anchor {
    /// Lowercase hex SHA-256 of the canonical receipt JSON.
    pub hash: String,
    pub anchored_at_ms: u64,
    pub block_height: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct ReceiptAnchors {
    owner: AccountId,
    anchors: LookupMap<String, Anchor>,
    count: u64,
}

fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[near]
impl ReceiptAnchors {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self { owner, anchors: LookupMap::new(b"a"), count: 0 }
    }

    /// Anchor a receipt hash. Only the owner (Anytill's anchoring account) may call it, and only once per receipt.
    pub fn anchor(&mut self, receipt_id: String, hash: String) -> Anchor {
        require!(env::predecessor_account_id() == self.owner, "only the owner can anchor receipts");
        require!(!receipt_id.is_empty() && receipt_id.len() <= 64, "receipt_id must be 1-64 characters");
        require!(is_sha256_hex(&hash), "hash must be 64 lowercase hex characters (SHA-256)");
        require!(!self.anchors.contains_key(&receipt_id), "receipt already anchored; anchors are write-once");
        let a = Anchor { hash: hash.clone(), anchored_at_ms: env::block_timestamp_ms(), block_height: env::block_height() };
        self.anchors.insert(receipt_id.clone(), a.clone());
        self.count += 1;
        log!(
            "EVENT_JSON:{{\"standard\":\"anytill_receipt\",\"version\":\"1.0.0\",\"event\":\"anchor\",\"data\":[{{\"receipt_id\":\"{}\",\"hash\":\"{}\"}}]}}",
            receipt_id,
            hash
        );
        a
    }

    pub fn get_anchor(&self, receipt_id: String) -> Option<Anchor> {
        self.anchors.get(&receipt_id).cloned()
    }

    /// True only if this exact hash was anchored for this receipt.
    pub fn verify(&self, receipt_id: String, hash: String) -> bool {
        self.anchors.get(&receipt_id).is_some_and(|a| a.hash == hash)
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn count(&self) -> u64 {
        self.count
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const H1: &str = "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4";
    const H2: &str = "0000000000000000000000000000000000000000000000000000000000000001";

    fn as_caller(who: usize) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(accounts(who)).block_timestamp(1_700_000_000_000_000_000).build());
    }

    #[test]
    fn owner_anchors_and_anyone_verifies() {
        as_caller(0);
        let mut c = ReceiptAnchors::new(accounts(0));
        let a = c.anchor("rcpt1".into(), H1.into());
        assert_eq!(a.hash, H1);
        assert_eq!(c.count(), 1);
        as_caller(2);
        assert!(c.verify("rcpt1".into(), H1.into()));
        assert!(!c.verify("rcpt1".into(), H2.into()), "a different hash must not verify");
        assert!(!c.verify("unknown".into(), H1.into()));
        assert_eq!(c.get_anchor("rcpt1".into()).unwrap().anchored_at_ms, 1_700_000_000_000);
    }

    #[test]
    #[should_panic(expected = "only the owner can anchor receipts")]
    fn strangers_cannot_anchor() {
        as_caller(0);
        let mut c = ReceiptAnchors::new(accounts(0));
        as_caller(1);
        c.anchor("rcpt1".into(), H1.into());
    }

    #[test]
    #[should_panic(expected = "write-once")]
    fn anchors_cannot_be_overwritten() {
        as_caller(0);
        let mut c = ReceiptAnchors::new(accounts(0));
        c.anchor("rcpt1".into(), H1.into());
        c.anchor("rcpt1".into(), H2.into());
    }

    #[test]
    #[should_panic(expected = "64 lowercase hex")]
    fn rejects_malformed_hashes() {
        as_caller(0);
        let mut c = ReceiptAnchors::new(accounts(0));
        c.anchor("rcpt1".into(), "ABC".into());
    }
}
