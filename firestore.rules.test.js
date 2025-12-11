/**
 * Firestore Security Rules Tests
 * 
 * To run these tests, you need:
 * 1. Install @firebase/rules-unit-testing: npm install --save-dev @firebase/rules-unit-testing
 * 2. Run: npm test -- firestore.rules.test.js
 * 
 * Note: These tests require Firebase emulators to be running
 * Start emulators: firebase emulators:start --only firestore
 */

const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require('@firebase/rules-unit-testing');
const { setLogLevel } = require('firebase/firestore');

// Suppress Firestore warnings in tests
setLogLevel('error');

let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'tripsync-test',
    firestore: {
      rules: require('./firestore.rules'),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

describe('Firestore Security Rules', () => {
  describe('Users Collection', () => {
    it('should allow authenticated users to read any user profile', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      // Create a user profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('users').doc('bob').set({
          email: 'bob@example.com',
          displayName: 'Bob',
        });
      });

      // Alice should be able to read Bob's profile
      await assertSucceeds(
        aliceDb.collection('users').doc('bob').get()
      );
    });

    it('should allow users to create their own profile', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await assertSucceeds(
        aliceDb.collection('users').doc('alice').set({
          email: 'alice@example.com',
          displayName: 'Alice',
          createdAt: new Date(),
        })
      );
    });

    it('should prevent users from creating other users profiles', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await assertFails(
        aliceDb.collection('users').doc('bob').set({
          email: 'bob@example.com',
          displayName: 'Bob',
        })
      );
    });

    it('should prevent unauthenticated users from reading profiles', async () => {
      const unauthenticated = testEnv.unauthenticatedContext();
      const unauthenticatedDb = unauthenticated.firestore();

      await assertFails(
        unauthenticatedDb.collection('users').doc('alice').get()
      );
    });
  });

  describe('Trips Collection', () => {
    it('should allow trip members to read trip', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      // Create a trip with Alice as member
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          name: 'Test Trip',
          members: { alice: true },
          roles: { alice: 'owner' },
        });
      });

      await assertSucceeds(
        aliceDb.collection('trips').doc('trip1').get()
      );
    });

    it('should prevent non-members from reading trip', async () => {
      const bob = testEnv.authenticatedContext('bob');
      const bobDb = bob.firestore();

      // Create a trip with only Alice as member
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          name: 'Test Trip',
          members: { alice: true },
          roles: { alice: 'owner' },
        });
      });

      await assertFails(
        bobDb.collection('trips').doc('trip1').get()
      );
    });

    it('should allow creating trip with creator as owner', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await assertSucceeds(
        aliceDb.collection('trips').doc('trip1').set({
          name: 'New Trip',
          members: { alice: true },
          roles: { alice: 'owner' },
        })
      );
    });

    it('should prevent creating trip without creator as owner', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await assertFails(
        aliceDb.collection('trips').doc('trip1').set({
          name: 'New Trip',
          members: { alice: true },
          roles: { alice: 'editor' }, // Not owner
        })
      );
    });

    it('should allow owners to delete trip', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          name: 'Test Trip',
          members: { alice: true },
          roles: { alice: 'owner' },
        });
      });

      await assertSucceeds(
        aliceDb.collection('trips').doc('trip1').delete()
      );
    });

    it('should prevent editors from deleting trip', async () => {
      const bob = testEnv.authenticatedContext('bob');
      const bobDb = bob.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          name: 'Test Trip',
          members: { alice: true, bob: true },
          roles: { alice: 'owner', bob: 'editor' },
        });
      });

      await assertFails(
        bobDb.collection('trips').doc('trip1').delete()
      );
    });
  });

  describe('Itinerary Subcollection', () => {
    it('should allow trip members to read itinerary items', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          members: { alice: true },
          roles: { alice: 'owner' },
        });
        await context.firestore()
          .collection('trips').doc('trip1')
          .collection('itinerary').doc('item1').set({
            title: 'Test Item',
            position: 1,
          });
      });

      await assertSucceeds(
        aliceDb.collection('trips').doc('trip1')
          .collection('itinerary').doc('item1').get()
      );
    });

    it('should allow trip members to create itinerary items', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          members: { alice: true },
          roles: { alice: 'owner' },
        });
      });

      await assertSucceeds(
        aliceDb.collection('trips').doc('trip1')
          .collection('itinerary').doc('item1').set({
            title: 'New Item',
            position: 1,
          })
      );
    });
  });

  describe('Chat Subcollection', () => {
    it('should allow trip members to read chat messages', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          members: { alice: true },
          roles: { alice: 'owner' },
        });
        await context.firestore()
          .collection('trips').doc('trip1')
          .collection('chat').doc('msg1').set({
            text: 'Hello',
            createdAt: new Date(),
            createdBy: 'alice',
          });
      });

      await assertSucceeds(
        aliceDb.collection('trips').doc('trip1')
          .collection('chat').doc('msg1').get()
      );
    });

    it('should allow trip members to create chat messages', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          members: { alice: true },
          roles: { alice: 'owner' },
        });
      });

      await assertSucceeds(
        aliceDb.collection('trips').doc('trip1')
          .collection('chat').doc('msg1').set({
            text: 'Hello',
            createdAt: new Date(),
            createdBy: 'alice',
          })
      );
    });

    it('should prevent creating message with wrong createdBy', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          members: { alice: true },
          roles: { alice: 'owner' },
        });
      });

      await assertFails(
        aliceDb.collection('trips').doc('trip1')
          .collection('chat').doc('msg1').set({
            text: 'Hello',
            createdAt: new Date(),
            createdBy: 'bob', // Wrong user
          })
      );
    });

    it('should allow message creator to delete their own message', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('trips').doc('trip1').set({
          members: { alice: true },
          roles: { alice: 'owner' },
        });
        await context.firestore()
          .collection('trips').doc('trip1')
          .collection('chat').doc('msg1').set({
            text: 'Hello',
            createdAt: new Date(),
            createdBy: 'alice',
          });
      });

      await assertSucceeds(
        aliceDb.collection('trips').doc('trip1')
          .collection('chat').doc('msg1').delete()
      );
    });
  });

  describe('Friend Requests', () => {
    it('should allow participants to read friend requests', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().collection('friendRequests').doc('req1').set({
          fromUid: 'alice',
          toUid: 'bob',
          status: 'pending',
        });
      });

      await assertSucceeds(
        aliceDb.collection('friendRequests').doc('req1').get()
      );
    });

    it('should prevent creating friend requests from client', async () => {
      const alice = testEnv.authenticatedContext('alice');
      const aliceDb = alice.firestore();

      await assertFails(
        aliceDb.collection('friendRequests').doc('req1').set({
          fromUid: 'alice',
          toUid: 'bob',
          status: 'pending',
        })
      );
    });
  });
});

