var mysql = require('mysql');
var moment = require('moment');
var request = require('request');
var request2 = require('request');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var morgan = require('morgan');
var crypto = require('crypto');

var jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens

var pool = mysql.createPool({
  connectionLimit: 4,
  host     : 'mysql.dentonpl.com',
  user     : 'statodentonplcom',
  password : '!J0fe6yc!',
  database : 'stato_dentonpl_com'
});


//Everything in here is specifically to enable CORS for testing
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  //res.header("Access-Control-Allow-Origin", "http://localhost");
  //res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "OPTIONS, GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Access-Control-Allow-Origin, Accept, x-access-token");
  res.header("Content-Type", "application/json");
  //next();
  
  // intercept OPTIONS method  THIS IS EXTREMELY IMPORTANT.  Not doing this always leads "complex" methods to freak out.
    if ('OPTIONS' == req.method) {
      res.sendStatus(200);
    }
    else {
      next();
    }
});


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//Use morgan to log requests
app.use(morgan('dev'));

//Create 

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

var computerLogRouter = express.Router();
var computerLogHistoryRouter = express.Router();
var roomLogRouter = express.Router();

app.get('/health', function(req, res)
{
    res.writeHead(200);
    res.end();
});

app.post('/register', function(req, res) {
	if(req.body.username && req.body.email && req.body.password){
	
		pool.query('SELECT * FROM users WHERE username = ?', [req.body.username], function(err, rows, fields) {				
		  if(err){
				reportError(err, res);
				return;
			}
			
			if(rows.length > 0){
				res.json({success: false, message:'Username not available, please pick another username.'});
			}
			else{
				var salt = crypto.randomBytes(256).toString('hex');
				var hashedpass = crypto.createHash("sha256")
				  .update(salt)
				  .update(req.body.password)
				  .digest('hex');
				
				pool.query('INSERT INTO users (username, email, role, password, password_s) VALUES (?, ?, ?, ?, ?) ', [req.body.username, req.body.email, 'user', hashedpass, salt], function(err, rows, fields) {
					if(err){
						reportError(err, res);
						return;
					}
					
					res.json({success: true, message:'User created.'});
				});
			}
			
		});
	}
	else{
	
	//Do something better here and on everything else that's expecting certain parameters that aren't caught by the router.  Otherwise, it may get in and throw an error when something isn't provided.
		console.log("bad");
		res.sendStatus(404);
	}
});

// route to authenticate a user (POST http://localhost:8080/api/authenticate)
app.post('/login', function(req, res) {

	pool.query('SELECT * FROM users WHERE username = ? AND active = 1', [req.body.username], function(err, rows, fields) {				
	  if(err){
			reportError(err, res);
			return;
		}
	
	if (rows.length == 0) {
		res.json({ success: false, message: 'Username not found.' });
		return;
	}
	
	var hashedpass = crypto.createHash("sha256")
			  .update(rows[0]['password_s'])
			  .update(req.body.password)
			  .digest('hex');
	
	if (rows[0]['password'] != hashedpass){
		res.json({ success: false, message: 'Incorrect password.' });
		return;
	}
	else{		
		// if user is found and password is right
		// create a token
		var token = jwt.sign({username: rows[0]['username'], branch: rows[0]['branch'], role: rows[0]['role']}, /*app.get('superSecret')*/'lexicallibrarian', {
		//expiresInMinutes: 720 // expires in 12 hours
		expiresIn: 480
		});

		// return the information including token as JSON
		res.json({
		success: true,
		message: 'Enjoy your token!',
		token: token
		});
	}
	  
	});
});

app.use(function(req, res, next) {

  // check header or url parameters or post parameters for token
  var token = /*req.body.token || req.query.token ||*/ req.headers['x-access-token'];

  // decode token
  if (token) {

    // verifies secret and checks exp
    jwt.verify(token, /*app.get('superSecret')*/'lexicallibrarian', function(err, decoded) {      
      if (err) {
		console.log("error " + err);
			return res.status(403).send({ 
			success: false, 
			message: 'Token expired.' 
		});   
      } else {
        // if everything is good, save to request for use in other routes
        console.log("Decoded token: " + JSON.stringify(decoded));
		req.decoded = decoded;    
        next();
      }
    });

  } else {

    // if there is no token
    // return an error
    return res.status(403).send({ 
        success: false, 
        message: 'No token provided.' 
    });
    
  }
});

app.get('/computer/list/:branch', function(req, res) {
	pool.query('SELECT * FROM computer_list WHERE branch = ? AND checkout = 1 AND status = 2', [req.params.branch], function(err, rows, fields) {				
		returnResult(res, rows);
	});
});

app.get('/computer/last/:branch', function(req, res) {
	pool.query('SELECT res.name FROM (SELECT * FROM computer_checkout_log LIMIT 40) AS logs JOIN (SELECT * FROM computer_list WHERE branch = ? AND checkout = 1) AS res ON logs.resource_id = res.id ORDER BY logs.time_out DESC LIMIT 1', [req.params.branch], function(err, rows, fields) {				
		if(err){
			reportError(err, res);
			return;
		}
		
		console.log("getting last checked out");
		returnResult(res, rows);
	});
});

app.get('/computer/status/:branch', function(req, res) {
	pool.query('SELECT res.id, res.name, res.branch, logs.id AS log_id, logs.pat_name, logs.time_out, logs.time_in FROM (SELECT * FROM computer_checkout_log WHERE DATE(time_out) = CURDATE()) AS logs JOIN (SELECT * FROM computer_list WHERE branch = ? AND checkout = 1 AND status = 2) AS res ON logs.resource_id = res.id ORDER BY res.name', [req.params.branch], function(err, rows, fields) {				
		if(err){
			reportError(err, res);
			return;
		}
		
		console.log("getting computer status");
		returnResult(res, rows);
	});
});

computerLogRouter.post('/', function(req, res) {
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

computerLogRouter.put('/:log_id', function(req, res) {
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

computerLogRouter.delete('/:log_id', function(req, res) {
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


app.get('/patinfo/:barcode', function(req, res) {
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

/*
app.get('/patinfo/:barcode', function(req, res) {
	var token = null;
	request({url: 'https://library.cityofdenton.com/iii/sierra-api/v2/token', method: 'POST', headers: {'Authorization': 'Basic R2lXcW85M04vYlZIUjU1S0FLL3dQK2xMUE4xdTpqb2ZlNnljYw=='}}, function(error, request, body){
		if(request.statusCode == '200'){
			//var accesscode = 'Bearer ' + body.access_token;
			token = JSON.parse(body).access_token;
		}
		else{
			console.log(request.statusCode);
			console.log(body);
			return;
		}
	});
	
	if(token){
		request({url: 'https://library.cityofdenton.com/iii/sierra-api/v2/patrons/find?barcode=' + req.params.barcode + '&fields=names%2CexpirationDate%2CmoneyOwed', method: 'GET', headers: {'Authorization': 'Bearer ' + token}}, function(error, request, body){
			console.log('made new request');
			if(request.statusCode == '200'){
				console.log('gotit');
				res.status(200);
				res.end(body);
			}
			else{
				res.status(400);
				res.end(body);
			}
		});
	}

});
*/
roomLogRouter.get('/:branch', function(req, res) {
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

roomLogRouter.post('/', function(req, res) {
	pool.query('UPDATE study_room_log SET time_out = NOW() WHERE time_out IS NULL AND resource_id = ?', [req.body.resource_id], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		else{
			console.log("update out times");
			pool.query('INSERT INTO study_room_log (resource_id, number_people) VALUES (?, ?)', [req.body.resource_id, req.body.number_people], function(err, rows, fields) {
				if(err){
					reportError(err, res);
					return;
				}
				
				console.log("logging room use");
				returnResult(res, rows);
			});
		}
	});
});

roomLogRouter.put('/:log_id', function(req, res) {
	console.log(req.params.log_id);
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

roomLogRouter.delete('/:log_id', function(req, res) {
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

app.get('/computer/history/', function(req, res) {
	
	/*if(!req.query.from || !req.query.until)
	{
		res.sendStatus(404);
	}
	*/
	console.log(req.query.from);
	//var from_date = new Date(req.query.from);
	//var until_date = new Date(req.query.until);
	var from = moment(req.query.from).format('YYYY-MM-DD');
	var until = moment(req.query.until).format('YYYY-MM-DD');
	
	pool.query('SELECT cl.branch, cl.name, COUNT(ccl.resource_id) AS checkouts FROM (SELECT resource_id FROM computer_checkout_log WHERE DATE(time_out) >= ? AND DATE(time_out) <= ?) AS ccl JOIN computer_list AS cl ON cl.id = ccl.resource_id GROUP BY cl.branch, cl.name WITH ROLLUP', [from, until], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		else{
			console.log("Fetching checkout totals per branch");
			returnResult(res, rows);
		}
	});

/*
SELECT cl.name, COUNT(ccl.resource_id) AS checkouts
FROM `computer_checkout_log` AS ccl
JOIN `computer_list` AS cl
ON cl.id = ccl.resource_id
GROUP BY cl.name WITH ROLLUP

 name 	branch 	checkouts 	
delta 	north 	2
echo 	north 	1
foxtrot 	north 	6
golf 	north 	4
NULL	north 	13

SELECT cl.name, cl.branch, COUNT( ccl.resource_id ) AS checkouts
FROM `computer_checkout_log` AS ccl
JOIN `computer_list` AS cl ON cl.id = ccl.resource_id
GROUP BY cl.branch, cl.name
WITH ROLLUP
LIMIT 0 , 30

 name 	branch 	checkouts 	
echo 	north 	1
foxtrot 	north 	6
golf 	north 	4
NULL	north 	11
delta 	south 	2
NULL	south 	2
NULL	NULL	13

*/
});

app.get('/room/history/', function(req, res) {
	
	/*if(!req.query.from || !req.query.until)
	{
		res.sendStatus(404);
	}
	*/
	console.log(req.query.from);
	//var from_date = new Date(req.query.from);
	//var until_date = new Date(req.query.until);
	var from = moment(req.query.from).format('YYYY-MM-DD');
	var until = moment(req.query.until).format('YYYY-MM-DD');
	
	pool.query('SELECT rl.branch, rl.name, COUNT(srl.resource_id) AS checkouts FROM (SELECT resource_id FROM study_room_log WHERE DATE(time_in) >= ? AND DATE(time_in) <= ?) AS srl JOIN room_list AS rl ON rl.id = srl.resource_id GROUP BY rl.branch, rl.name WITH ROLLUP', [from, until], function(err, rows, fields) {
		if(err){
			reportError(err, res);
			return;
		}
		else{
			console.log("Fetching room totals per branch");
			returnResult(res, rows);
		}
	});
});

app.use('/computer/log', computerLogRouter);
app.use('/room/log', roomLogRouter);

app.listen(process.env.OPENSHIFT_NODEJS_PORT, process.env.OPENSHIFT_NODEJS_IP, function(){console.log("Sever started!")});

