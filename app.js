// Configure & start express.
var express = require('express');
var fs = require('fs');
var path = require('path');
var middleware = require('./middleware');
var logger = require('./lib/logging').logger;
var configuration = require('./lib/configuration');
var hogan = require('hogan.js');
var hoganadapter = require('./lib/hogan-express.js');

var app = express.createServer();
app.logger = logger;
app.config = configuration;

// default view engine
app.set('view engine', 'hogan.js');
app.register('hogan.js', hoganadapter.init(hogan));

// View helpers. `user` and `badges` are set so we can use them in `if`
// statements without getting undefined errors and without having to use typeof
// checks.
app.helpers({
  login: true,
  title: 'Backpack',
  error: [],
  success: [],
  badges: {},
});

app.dynamicHelpers({
  user: function (req, res) {
    return req.user || null;
  }
});

// Middleware. Also see `middleware.js`
// ------------------------------------
app.use(express.static(path.join(__dirname, "static")));
app.use(express.static(path.join(configuration.get('var_dir'), "badges")));
app.use(middleware.noFrame({ whitelist: [ '/issuer/frame.*', '/', '/share/.*' ] }));
app.use(express.bodyParser({ uploadDir: configuration.get('badge_path') }));
app.use(express.cookieParser());
app.use(express.methodOverride());
app.use(middleware.logRequests());
app.use(middleware.cookieSessions());
app.use(middleware.userFromSession());
app.use(middleware.csrf({
  whitelist: [
    '/backpack/authenticate',
    '/issuer/validator/?',
    '/displayer/convert/.+',
    '/issuer/frameless.*'
  ]
}));
app.use(middleware.cors({ whitelist: ['/_badges.*', '/issuer.*', '/baker', '/displayer/.+/group.*'] }));
app.configure('development', function () {
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});
app.configure('production', function () {
  app.use(express.errorHandler());
});


// Routes
// ------
const baker = require('./controllers/baker');
const badge = require('./controllers/badge');
const issuer = require('./controllers/issuer');
const displayer = require('./controllers/displayer');
const demo = require('./controllers/demo');
const backpack = require('./controllers/backpack');
const group = require('./controllers/group');
const share = require('./controllers/share');

// Parameter handlers
app.param('badgeId', badge.findById);
app.param('dUserId', displayer.param.dUserId);
app.param('dGroupId', displayer.param.dGroupId);
app.param('groupId', group.findById);
app.param('groupUrl', share.findGroupByUrl);

app.get('/baker', baker.baker);
app.get('/issuer.js', issuer.generateScript);
app.get('/issuer/frame', issuer.frame);
app.post('/issuer/frameless', issuer.frameless);
app.get('/issuer/assertion', issuer.issuerBadgeAddFromAssertion);
app.post('/issuer/assertion', issuer.issuerBadgeAddFromAssertion);
app.get('/issuer/validator', issuer.validator);
app.post('/issuer/validator', issuer.validator);
app.get('/issuer/welcome', issuer.welcome);

app.get('/displayer/convert/email', displayer.emailToUserIdView);
app.post('/displayer/convert/email', displayer.emailToUserId);
app.get('/displayer/:dUserId/groups.:format?', displayer.userGroups);
app.get('/displayer/:dUserId/group/:dGroupId.json', displayer.userGroupBadges);

app.get('/demo', demo.issuer);
app.get('/demo/ballertime', demo.massAward);
app.get('/demo/badge.json', demo.demoBadge);
app.get('/demo/invalid.json', demo.badBadge);
app.post('/demo/award', demo.award);

app.get('/', backpack.manage);
app.get('/backpack', backpack.manage)
app.get('/backpack/login', backpack.login);
app.get('/backpack/signout', backpack.signout);
app.post('/backpack/badge', backpack.userBadgeUpload);
app.post('/backpack/authenticate', backpack.authenticate);
app.get('/stats', backpack.stats);
app.get('/backpack/badge/:badgeId', backpack.details);
app.delete('/backpack/badge/:badgeId', backpack.deleteBadge);

app.delete('/badge/:badgeId', badge.destroy);

app.post('/group', group.create);
app.put('/group/:groupId', group.update);
app.delete('/group/:groupId', group.destroy);

app.get('/share/:groupUrl/edit', share.editor);
app.post('/share/:groupUrl', share.createOrUpdate);
app.put('/share/:groupUrl', share.createOrUpdate);
app.get('/share/:groupUrl', share.show);

if (!module.parent) {
  var start_server = function start_server(app) {
    var port = app.config.get('port');
    var pid = process.pid.toString();
    var pidfile = path.join(app.config.get('var_path'), 'server.pid');

    app.listen(port);
    app.logger.info('environment: ' + process.env['NODE_ENV']);
    app.logger.info('opening server on port: ' + port);
    app.logger.info('READY PLAYER ONE');

    fs.unlink(pidfile, function () {
      fs.writeFile(pidfile, pid, function (err) {
        if (err) throw Error('could not make pidfile: ' + err);
      });
    });

    process.on('SIGTERM', function () {
      app.logger.info('recieved SIGTERM, exiting');
      process.exit();
    });
  };
  start_server(app);
} else {
  module.exports = app;
}
