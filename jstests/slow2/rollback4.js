// Test a large rollback SERVER-2737

var replTest = new ReplSetTest({ name: 'unicomplex', 
                                 nodes: 3, 
                                 oplogSize: 2000,
                              });
var nodes = replTest.nodeList();

var conns = replTest.startSet({verbose: 1});
var r = replTest.initiate({ "_id": "unicomplex",
                          "members": [
                                      { "_id": 0, "host": nodes[0] },
                                      { "_id": 1, "host": nodes[1] },
                                      { "_id": 2, "host": nodes[2], arbiterOnly: true}]
                          }, 'replSetInitiate', 600000);

// Make sure we have a master
var master = replTest.getMaster();
b_conn = conns[1];
b_conn.setSlaveOk();
B = b_conn.getDB("admin");

// Make sure we have an arbiter
assert.soon(function () {
            res = conns[2].getDB("admin").runCommand({ replSetGetStatus: 1 });
            return res.myState == 7;
            }, "Arbiter failed to initialize.");

// Wait for initial replication
replTest.awaitReplication();

// Insert into master
var big = { b:new Array( 1000 ).toString() };
var bulk = master.getDB('db').c.initializeUnorderedBulkOp();
for( var i = 0; i < 1000000; ++i ) {
    bulk.insert( big );
}
assert.writeOK(bulk.execute());

// Stop master
replTest.stop( 0 );

// Wait for slave to take over
// This can take a while if the secondary has queued up many writes in its
// buffer, since it needs to flush those out before it can assume the primaryship.
assert.soon(function () { return B.isMaster().ismaster; }, "waiting for new primary", 60000);
master = replTest.getMaster();

// Save to new master, forcing rollback of old master
master.getDB( 'db' ).c.save( big );

// Restart old master
replTest.restart( 0 );
// Wait five minutes to ensure there is enough time for rollback
replTest.awaitReplication(5*60*1000);
