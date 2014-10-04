//Twitter API settings//
const apiKey = "";
const apiSecret = "";
const accessToken = "";
const accessTokenSecret = "";

//Initialise libraries//
var express = require("express");
var io = require("socket.io");
var http = require("http");
var twitter = require("ntwitter");
var cronJob = require("cron").CronJob;
var path = require("path");

var app = express(); //Instantiate the express app

var server = http.createServer(app); //Create the HTTP server

//Initialise the express app//
app.set("port", process.env.PORT || 3000);
app.use(express.logger("dev"));
app.use(app.router);

app.use("/components", express.static(path.join(__dirname, "components"))); //Load components

//Start listening for socket.io connections//
var sockets = io.listen(server);
sockets.set("transports", ["xhr-polling"]);
sockets.set("polling duration", 10);

//Instantiate the twitter connection
var t = new twitter({
	consumer_key: apiKey,
	consumer_secret: apiSecret,
	access_token_key: accessToken,
	access_token_secret: accessTokenSecret
});

var searchTerms = []; //Twitter search terms array

//Capture trends (called every 10mins via cron job)//
var twitter_getTrends = function() {
	searchTerms = []; //Clear extisting terms array
	
	t.getTrendsWithId("23424977", null, function(err, data) {	//US WOEID: 23424977 (For retrieving currently trending topics from the US)
		for (var i=0; i<data[0].trends.length; i++) {			//Add each current trend to the search terms array
			searchTerms.push(data[0].trends[i].name);
		}
		
		twitter_initiateStream(); //Start consuming stream API data
	});
}

var twitterStream; //Public var to refer to stream (for destruction later)

//Tell the twitter API to filter on the searchTerms//
var twitter_initiateStream = function() {
	t.stream("statuses/filter", { track: searchTerms }, function(stream) {
		
		twitterStream = stream; //Set public var to our current stream
		
		stream.on("data", function(tweet) {	//Data arrives
			
			if (tweet.text == undefined) return;	//Check that a tweet was delivered successfully
			
			var text = tweet.text.toLowerCase();
			var matchingTerm = "";
			for (var i=0; i < searchTerms.length; i++) {	//Check that at least one trending term was mentioned in the received tweet
				if (text.indexOf(searchTerms[i].toLowerCase()) != -1) {
					matchingTerm = searchTerms[i];
					break;
				}
			}
			
			if (matchingTerm == "") return;		//If there was a match, send the latest data out
			var rTweet = { time:tweet.created_at, tweet_id:tweet.id_str, text:tweet.text, user_id:tweet.user.screen_name, user_name:tweet.user.name, user_image:tweet.user.profile_image_url }; //Copy out only the needed tweet data to a new object for transmission
			sockets.sockets.emit("data", { l:searchTerms, m:matchingTerm, t:rTweet });	//Send new data to any connected clients
		});
	});
};

//Send any new connections the latest trends list
sockets.sockets.on("connection", function(socket) { 
	socket.emit("data", {l:searchTerms, m:"", t:""});
});

//Refresh the trends list every 10mins. Max is currently once per minute according to Twitter API docs, but this seems unnecessary and may result in more frequent interruptions for users picking short-lived trends
new cronJob("0 */10 * * * *", function() {
	if (twitterStream) {
		twitterStream.destroy();
		twitter_getTrends();
	}
}, null, true);

//Start the server
server.listen(app.get("port"), function() {
	console.log("Express server listening on port " + app.get("port"));
});

//Begin consuming the Twitter data (trends first, then the stream API)
twitter_getTrends();