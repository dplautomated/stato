var mysql = require('mysql');
var moment = require('moment');
var request = require('request');
var request2 = require('request');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var morgan = require('morgan');

var jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens

var pool = mysql.createPool({
  connectionLimit: 4,
  host     : 'mysql.dentonpl.com',
  user     : 'statodentonplcom',
  password : '!J0fe6yc!',
  database : 'stato_dentonpl_com'
});

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "OPTIONS, GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Access-Control-Allow-Origin, Accept");
  res.header("Content-Type", "application/json");
  next();
});


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//Use morgan to log requests
app.use(morgan('dev'));

function reportError(err, res){
	res.status(404);
	res.end(JSON.stringify({'error': err.code}));
	console.log(err);
	return;
}

function returnResult(res, rows){
	res.status(200);
	res.end(JSON.stringify(rows));
}

var statomaticRouter = express.Router();

// route to authenticate a user (POST http://localhost:8080/api/authenticate)
statomaticRouter.post('/login', function(req, res) {

	pool.query('SELECT * FROM users WHERE username = ? AND active = 1', [req.body.username], function(err, rows, fields) {				
	  if(err){
			reportError(err, res);
			return;
		}
		
		/*
	  var hashedpass = = crypto.createHash("sha256")
	  .update(rows[0][1])
      .update(password)
      .digest('hex');
	*/
	console.log(rows);
	console.log(rows.length);
	
	if (rows.length == 0) {
		res.json({ success: false, message: 'Username not found.' });
	}
	else if (rows[0]['password1'] != req.body.password){
		res.json({ success: false, message: 'Incorrect password.' });
	}
	else{		
		// if user is found and password is right
		// create a token
		var token = jwt.sign({username: rows[0]['username'], id: rows[0]['id']}, /*app.get('superSecret')*/'lexicallibrarian', {
		expiresInMinutes: 720 // expires in 12 hours
		});

		// return the information including token as JSON
		res.json({
		success: true,
		message: 'Enjoy your token!',
		token: token
		});
	}
	  
	});
/*
  // find the user
  User.findOne({
    name: req.body.name
  }, function(err, user) {

    if (err) throw err;

    if (!user) {
      res.json({ success: false, message: 'Authentication failed. User not found.' });
    } else if (user) {

      // check if password matches
      if (user.password != req.body.password) {
        res.json({ success: false, message: 'Authentication failed. Wrong password.' });
      } else {

        // if user is found and password is right
        // create a token
        var token = jwt.sign(user, app.get('superSecret'), {
          expiresInMinutes: 1440 // expires in 24 hours
        });

        // return the information including token as JSON
        res.json({
          success: true,
          message: 'Enjoy your token!',
          token: token
        });
      }   

    }

  });
  */
});

statomaticRouter.get('/computer/:branch', function(req, res) {
	pool.query('SELECT * FROM computer_checkout_list WHERE branch = ? AND checkout = 1 AND status = 2', [req.params.branch], function(err, rows, fields) {				
		returnResult(res, rows);
	});
});

statomaticRouter.get('/computer/status/:branch', function(req, res) {
	pool.query('SELECT res.id, res.name, res.branch, logs.id AS log_id, logs.pat_name, logs.time_out, logs.time_in FROM (SELECT * FROM computer_checkout_log WHERE DATE(time_out) = CURDATE()) AS logs JOIN (SELECT * FROM computer_checkout_list WHERE branch = ? AND checkout = 1 AND status = 2) AS res ON logs.resource_id = res.id ORDER BY res.name', [req.params.branch], function(err, rows, fields) {				
		if(err){
			reportError(err, res);
			return;
		}
		
		console.log("getting computer status");
		returnResult(res, rows);
	});
});

statomaticRouter.get('/computer/last/:branch', function(req, res) {
	pool.query('SELECT res.name FROM (SELECT * FROM computer_checkout_log LIMIT 40) AS logs JOIN (SELECT * FROM computer_checkout_list WHERE branch = ? AND checkout = 1) AS res ON logs.resource_id = res.id ORDER BY logs.time_out DESC LIMIT 1', [req.params.branch], function(err, rows, fields) {				
		if(err){
			reportError(err, res);
			return;
		}
		
		console.log("getting last checked out");
		returnResult(res, rows);
	});
});

statomaticRouter.post('/computer', function(req, res) {
	pool.query('UPDATE computer_checkout_log SET time_in = NOW() WHERE resource_id = ? AND time_in IS NULL', [req.body.resource_id], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		pool.query('INSERT INTO computer_checkout_log (resource_id, pat_name) VALUES (?, ?)', [req.body.resource_id, req.body.patron_name], function(err, rows, fields) {
			if(err){
				reportError(err, res);
				return;
			}
			
			console.log("logging computer");
			returnResult(res, rows);
		});
	});
});

statomaticRouter.put('/computer/:log_id', function(req, res) {
	pool.query('UPDATE computer_checkout_log SET time_in = NOW() WHERE time_in IS NULL AND id = ?', [req.params.log_id], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		else{
			returnResult(res, rows);
		}
	});
});

statomaticRouter.delete('/computer/:log_id', function(req, res) {
	console.log(req.params.log_id);
	pool.query('DELETE FROM computer_checkout_log WHERE id = ?', [req.params.log_id], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		else{
			returnResult(res, rows);
		}
	});
});

statomaticRouter.get('/patinfo/:barcode', function(req, res) {
	request({url: 'https://library.cityofdenton.com/iii/sierra-api/v2/token', method: 'POST', headers: {'Authorization': 'Basic R2lXcW85M04vYlZIUjU1S0FLL3dQK2xMUE4xdTpqb2ZlNnljYw=='}}, function(error, request, body){
		if(request.statusCode == '200'){
			//var accesscode = 'Bearer ' + body.access_token;
			var parsedbody = JSON.parse(body);
			request2({url: 'https://library.cityofdenton.com/iii/sierra-api/v2/patrons/find?barcode=' + req.params.barcode + '&fields=names%2CexpirationDate%2CmoneyOwed', method: 'GET', headers: {'Authorization': 'Bearer ' + parsedbody.access_token}}, function(error2, request2, body2){
				console.log('made new request');
				if(request2.statusCode == '200'){
					console.log('gotit');
					res.status(200);
					res.end(body2);
				}
				else{
					res.status(400);
					res.end(body2);
				}
			});
		}
		else{
			console.log(request.statusCode);
			console.log(body);
		}
	});

});

statomaticRouter.get('/room/:branch', function(req, res) {
	pool.query('SELECT res.id, res.name, res.branch, logs.id AS log_id, logs.number_people, logs.time_in, logs.time_out  FROM (SELECT * FROM room_list WHERE branch = ? AND active = 1) AS res LEFT JOIN (SELECT * FROM study_room_log WHERE time_out IS NULL and DATE(time_in) = CURDATE()) AS logs ON res.id = logs.resource_id ORDER BY res.name', [req.params.branch, 'study_room'], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		
		console.log("getting rooms");
		console.log(JSON.stringify(rows));
		returnResult(res, rows);
	});
});

statomaticRouter.post('/room', function(req, res) {
	pool.query('UPDATE study_room_log SET time_out = NOW() WHERE time_out IS NULL AND resource_id = ?', [req.body.resource_id], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		else{
			console.log("update out times");
			pool.query('INSERT INTO study_room_log (resource_id, number_people) VALUES (?, ?)', [req.body.resource_id, req.body.number_people], function(err, rows, fields) {
				if(err){
					console.log("loggingerror");
					reportError(err, res);
					return;
				}
				
				console.log("logging room use");
				returnResult(res, rows);
			});
		}
	});
});

statomaticRouter.put('/room/:log_id', function(req, res) {
	pool.query('UPDATE study_room_log SET time_out = NOW() WHERE time_out IS NULL AND id = ?', [req.params.log_id], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		else{
			console.log("logging room out");
			returnResult(res, rows);
		}
	});
});

statomaticRouter.delete('/room/:log_id', function(req, res) {
	pool.query('DELETE FROM study_room_log WHERE id = ?', [req.params.log_id], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		else{
			console.log("deleting");
			returnResult(res, rows);
		}
	});
});

app.use('/', statomaticRouter);

app.listen(8080);

