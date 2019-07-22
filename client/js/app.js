(function(window) {
	
	//System states//
	const STATE_WELCOME = "STATE_WELCOME";
	const STATE_PLAYING_TWEETS = "STATE_PLAYING_TWEETS";
	const STATE_PAUSING_TWEETS = "STATE_PAUSING_TWEETS";
	const STATE_CHANGING_TOPIC = "STATE_CHANGING_TOPIC";
	const STATE_ERROR = "STATE_ERROR";
	
	//Config//
	const serverAddress = "https://peaceful-hollows-8770.herokuapp.com";	//Add your node.js/socket.io server address here
	
	//Info copy//
	const msgNotTrending = "Darn! That topic just stopped trending - please choose another";
	const msgFlushing = "Flushing old tweets...";
	const msgSlow = "Hrm... slow topic. Try another?";
	const msgNoTrendsYet = "Oops! No trends loaded yet - please try again in a moment";
	
	//Spiral characteristics//
	const spiralMax = 30;
	const spiralMaxLite = 10;
	const tDur = 0.4;
	const spiralMaxRad = 400;
	const spiralMinRad = 5;
	const spiralMaxRot = Math.PI * 9;
	const spiralMaxRotLite = Math.PI * 3;
	const spiralMinScale = 0.075;
	
	//Timing settings (ms)//
	const minDelayLite = 400;
	const slowThreshold = 6000;
	var lastTime = 0;
	
	//For dynamic positioning//
	const headerH = 100;
	const asideW = 350;
	const spiralScalePad = 250;
	const smallScreenThreshold = 850;
	var smallScreen = false;
	var isLite = false;
	
	//Tweet box background colours; generated elsewhere//
	const tweetCols = ["#40A5C4", "#49A8B0", "#52AC9D", "#5BB08A", "#64B376", "#6DB763", "#76BB50", "#80BF3D", "#8FBE37", "#9EBD32", "#ADBC2D", "#BCBC28", "#CBBB23", "#DABA1E", "#E9BA19", "#E6AB1A", "#E39C1B", "#E18E1D", "#DE7F1E", "#DC7120", "#D96221", "#D75423", "#D6502C", "#D54C35", "#D4483E", "#D44447", "#D34050", "#D23C59", "#D23963", "#C6416A", "#BB4971", "#B05178", "#A45A7F", "#996286", "#8E6A8D", "#837395", "#797A9B", "#6F81A2", "#6688A9", "#5C8FAF", "#5396B6", "#499DBD"];
	var currentCol = 0;
	
	//Cached reference for future reference//
	var spiralRootDomRef;
	var asideRef;
	
	
	//App definition//
	var app = angular.module("toilet", ["ngAnimate"]);
	
	
	//Socket.io factory//
	app.factory("socket", function($rootScope) {
		var socket = io.connect(serverAddress);
		return {
			on: function(eventName, callback) {
				socket.on(eventName, function() {	
					var args = arguments;
					$rootScope.$apply(function() {
						callback.apply(socket, args);
					});
				});
			}
		};
	});
	
	//Core app controller//
	app.controller("ToiletController", function($scope, $timeout, socket) {
		
		//Current state//
		$scope.state = STATE_WELCOME;
		$scope.showInfoBox = false;
		$scope.infoBoxMessage = "";
		$scope.infoInterval = 0;
		$scope.stillTrending = true;
		$scope.reportedSlow = false;
		
		//Tweets//
		$scope.tweets = [];
		$scope.tInc = 0;
		this.currentCol = 0;
		
		//Trends//
		$scope.trends = [];
		$scope.chosenTrend = "____NONE____";
		$scope.nextTrend = "____NONE____";
		
		//User opts for auto selection of topic//
		this.trend_choose = function () {
			if ($scope.trends.length == 0) {
				$scope.infoBox_show(msgNoTrendsYet);
				return;
			}
			var newTrend = $scope.trends[Math.min($scope.trends.length-1, Math.floor(5 * Math.random()))];
			this.trend_select(newTrend);
		}
		
		//Activate new topic//
		this.trend_select = function(newTrend) {
			if (newTrend == $scope.chosenTrend) return;
			
			spiralRoot_position();
			
			switch ($scope.state) {
				case STATE_WELCOME:
					lastTime = Date.now();
					$scope.chosenTrend = newTrend;
					$scope.state = STATE_PLAYING_TWEETS;
					break;
				case STATE_PLAYING_TWEETS:
				case STATE_PAUSING_TWEETS:
					$scope.nextTrend = newTrend;
					this.trend_startChange();
					break;
				case STATE_CHANGING_TOPIC:		//Don't interrupt mid-transition, but set next trend for when complete
					$scope.nextTrend = newTrend;
					return;
			}
		};
		
		//When tweets are already running on a previous topic, 'flush' them before loading any new ones//
		this.trend_startChange = function() {
			$scope.state = STATE_CHANGING_TOPIC;
			var tweets = $scope.tweets.slice().reverse();	//Traverse tweets array from newest to oldest
			
			if (tweets.length == 0) {	//If there have been no tweets loaded for the previous topic, there is nothing to 'flush' so skip to loading the new topic tweets
				this.trend_endChange();
				return;	
			}
			
			$scope.infoBox_show(msgFlushing);	//Show flushing message
						
			var calledEnd = false;	//Track that the trend_endChange function called only once
			
			for (var i=0; i<tweets.length; i++) {
				var tweet = tweets[i];
				var domRef = tweet.domRef;
				if (! domRef) {		//Try to grab the DOM reference if it wasn't previously captured
					domRef = window.document.getElementById("box"+tweet.tInc);
					if (domRef) {
						tweet.domRef = domRef;
						tweet.domRef.style["background-color"] = tweet.domRef.style["backgroundColor"] = tweet.colour;	//Apply the previously selected colour to the div background
					} else {
						continue; //Skip this tweet if the capture failed; it should be added to the DOM and available at the next cycle
					}
				}
				//Set tween duration based on how close each tweet is to the centre of the spiral
				var tFlushDur;
				if (isLite) tFlushDur = Math.max(0, 1.75 * ((spiralMaxLite - i) / spiralMaxLite));
				else tFlushDur = Math.max(0, 1.75 * ((spiralMax - i) / spiralMax));
				
				//Call the trend_endChange function only once (for the most recently arrived tweet, as it's tween will be the last to complete)
				if (calledEnd) {
					Twixt.to(tweet, tFlushDur, { sProp:1, ease:"quadInOut", onUpdate:$scope.spiral_update, onUpdateParams:[tweet], onComplete:$scope.tweet_removeFromArray, onCompleteParams:[tweet] } );
				} else {
					Twixt.to(tweet, tFlushDur, { sProp:1, ease:"quadInOut", onUpdate:$scope.spiral_update, onUpdateParams:[tweet], onComplete:this.trend_endChange, onCompleteParams:[tweet] } );
					calledEnd = true;
				}
			}
		};
		
		//Finalise topic change once the 'flush' animation above has completed//
		this.trend_endChange = function(lastTweet) {
			if (lastTweet) $scope.tweet_removeFromArray(lastTweet);
			$scope.stillTrending = true;
			$scope.reportedSlow = false;
			lastTime = Date.now();			//Capture current time so that a 'slow topic' message isn't set prematurely
			$scope.chosenTrend = $scope.nextTrend;
			$scope.state = STATE_PLAYING_TWEETS;
		};
		
		//Change play state//
		this.playPause_toggle = function() {
			switch ($scope.state) {
				case STATE_PLAYING_TWEETS:
					$scope.state = STATE_PAUSING_TWEETS;
					break;
				case STATE_PAUSING_TWEETS:
					lastTime = Date.now();	//Capture current time so that a 'slow topic' message isn't set prematurely
					$scope.state = STATE_PLAYING_TWEETS;
					break;
			}
		};
		
		//Show/hide status messages//
		$scope.infoBox_show = function(message, delay) {
			if (! delay) delay = 2000;
			$timeout.cancel($scope.infoInterval);
			$scope.infoBoxMessage = message;
			$scope.showInfoBox = true;
			$scope.infoInterval = $timeout($scope.infoBox_hide, delay);
		};
		$scope.infoBox_hide = function() {
			$timeout.cancel($scope.infoInterval);
			$scope.showInfoBox = false;
		};
		
		//Check whether chosen trend stopped//
		$scope.trend_checkContinuing = function() {
			if (($scope.chosenTrend != "____NONE____") && ($scope.state != STATE_CHANGING_TOPIC)) {
				if ($scope.trends.indexOf($scope.chosenTrend) == -1) {
					$scope.stillTrending = false;
					$scope.infoBox_show(msgNotTrending, 6000);
				}
			}
		};
		
		//Tweet data in from socket.io instance//
		socket.on("data", function(data) {
			if (data.l) {			//Check that the list of trending topics has been received
				var same = true;
				for (var i=0; i<data.l.length; i++) {
					same &= (data.l[i] == $scope.trends[i]);
				}
				if (! same) {		//If the list just changed, check whether the selected topic is still in the list (and receiving tweets)
					$scope.trends = data.l;
					$scope.trend_checkContinuing();
				}
			}
			
			if (! data.t) return;	//Check that a tweet has been received
			
			if (($scope.state == STATE_PAUSING_TWEETS) || ($scope.state == STATE_CHANGING_TOPIC) || ($scope.state == STATE_WELCOME)) return;
			
			data.t.tInc = $scope.tInc++;	//Increment the tweet identifier for picking up the DOM reference later
			
			var now = Date.now();
			if ((lastTime + slowThreshold) < now) {		//Check whether tweets are coming in slowly for this topic, and suggest a change of trend if so
				if ($scope.stillTrending && (! $scope.reportedSlow)) {
					$scope.reportedSlow = true;
					$scope.infoBox_show(msgSlow, 5000);
				}
			}
			
			if (data.m != $scope.chosenTrend) return;	//Check that the sent tweet contains the chosen trend
			
			if ((lastTime + minDelayLite) > now) {		//When running on a mobile device, prevent tweets coming in too quickly
				if (isLite) return;
			}
			lastTime = now;
			
			//Set initial data for tweet//
			data.t.user_image = data.t.user_image.replace("_normal.", "_reasonably_small.");		//Load larger profile image
			data.t.link = "https://twitter.com/" + data.t.user_id + "/status/" + data.t.tweet_id;	//Contrust link to individual tweet page
			data.t.time = data.t.time.replace("+0000 ", "") + " UTC";								//Format time string
			data.t.sProp = -0.01;									//Indicates proportion around spiral (0 > 1), set to a negative to indicate its pre-spiral position
			data.t.opacity = 0;										//Initially transparent
			data.t.colour = tweetCols[currentCol];					//Take bg colour (to be applied later) from spectrum array, then increment and loop back to 0 if at the end
			currentCol ++;
			if (currentCol >= tweetCols.length) currentCol = 0;
			
			$scope.tweets.push(data.t);		//Add to the main $scope.tweets array, where it will be added to the DOM via AngularJS's ng-repeat
			
			//Tweets are generally removed from the $scope.tweets array (and the DOM) when they have finished animating,
			//but if tweets are coming in so quickly that they make the array exceed its target length significantly,
			//remove the oldest tweet from the array, limiting the number of tweets drawn on the screen
			if (isLite) {
				if ($scope.tweets.length > (spiralMaxLite * 1.5)) $scope.tweets.shift();
			} else {
				if ($scope.tweets.length > (spiralMax * 1.5)) $scope.tweets.shift();
			}
			
			$timeout($scope.tweets_animate);	//Timeout used to ensure that the new DOM elements will have been added by AngularJS
		});
		
		//Animate all tweets in the spiral around due to a new tweet being added to the array//
		$scope.tweets_animate = function() {
			if ($scope.state == STATE_CHANGING_TOPIC) return;	//Don't overwrite 'flushing' tweens if they have been started
			
			var tweets = $scope.tweets.slice().reverse();		//Traverse tweets array from newest to oldest
			
			for (var i=0; i<tweets.length; i++) {
				var tweet = tweets[i];
				var domRef = tweet.domRef;
				if (! domRef) {		//Try to grab the DOM reference if it wasn't previously captured
					domRef = window.document.getElementById("box"+tweet.tInc);
					if (domRef) {
						tweet.domRef = domRef;
						tweet.domRef.style["background-color"] = tweet.domRef.style["backgroundColor"] = tweet.colour;	//Apply the previously selected colour to the div background
					} else {
						continue; //Skip this tweet if the capture failed; it should be added to the DOM and available at the next cycle
					}
				}
				//Set target spiral proportion based on whether in 'lite' (mobile) mode
				var targetSProp;
				if (isLite) targetSProp = Math.min(1, i/(spiralMaxLite-1));
				else targetSProp = Math.min(1, i/(spiralMax-1));
				
				//Call tweening function; with onComplete function to remove the tweet from the array if at the end of spiral
				if (targetSProp < 1) Twixt.to(tweet, tDur, { sProp:targetSProp, ease:"quadInOut", onUpdate:$scope.spiral_update, onUpdateParams:[tweet] } );
				else Twixt.to(tweet, tDur, { sProp:targetSProp, ease:"quadInOut", onUpdate:$scope.spiral_update, onUpdateParams:[tweet], onComplete:$scope.tweet_removeFromArray, onCompleteParams:[tweet] } );
			}
		};
		
		//Ease function for modifying certain aspects of the spiral's motion//
		$scope.sineOut = function (ct, sv, dv, tt) { return dv * Math.sin(ct/tt * (Math.PI/2)) + sv; };
		
		//Called on every frame of each tweet box's spiral tween//
		$scope.spiral_update = function(tweet) {
			var offsetLeft, offsetTop, rad, rot, scale, opacity, easedProp, lesserEasedProp, brightness;
			
			if (tweet.sProp < 0) {	//Just arrived on the page, outside main spiral motion (animate from left of the spiral top to the middle, and from transparent to opaque)
				opacity = Math.min(1, (1 - (tweet.sProp * -100)));
				offsetLeft = (500 * 100 * tweet.sProp) - 300;
				offsetTop = (-1 * spiralMaxRad) - 79;
				rot = 0;
				scale = 1;
				brightness = 1;
			} else {				//Within main spiral motion, gradually increase rotation around center, reducing scale and radius of circle
				easedProp = $scope.sineOut(tweet.sProp, 0, 1, 1);
				lesserEasedProp = (Number(tweet.sProp) + Number(tweet.sProp) + easedProp) / 3;
				rad = spiralMaxRad + ((spiralMinRad - spiralMaxRad) * easedProp);
				if (isLite) rot = spiralMaxRotLite * lesserEasedProp;
				else rot = spiralMaxRot * lesserEasedProp;
				scale = 1 - (easedProp * (1 - spiralMinScale));
				
				offsetLeft = (Math.sin(rot) * rad) - 300;
				offsetTop = (-1 * (Math.cos(rot) * rad)) - 79;
				
				//Start lowering opacity in last 20% of spiral
				if (tweet.sProp > 0.8) opacity = 1 - ((tweet.sProp - 0.8) / 0.2);
				else opacity = 1;
				
				//Start lowering brightness after 40% of spiral
				if (tweet.sProp > 0.4) brightness = 0.3 + (0.7 * (1 - ((tweet.sProp - 0.4) / 0.6)));
				else brightness = 1;
			}
			
			//Apply the new style settings to the domRef
			var tString = "translate3d(" + offsetLeft + "px, " + offsetTop + "px, 0px) rotate(" + rot + "rad) scale(" + scale + ")";
			tweet.domRef.style.transform = tweet.domRef.style["-webkit-transform"] = tweet.domRef.style["-moz-transform"] = tweet.domRef.style["-ms-transform"] = tString;
			if (brightness != 1) {
				var bString = "brightness(" + brightness + ")";
				tweet.domRef.style.filter = tweet.domRef.style["-webkit-filter"] = bString;
			}
			tweet.domRef.style.opacity = opacity;
		};
		
		//Take tweet out of $scope.tweets array once its animation is complete
		$scope.tweet_removeFromArray = function(tweet) {
			var ind = $scope.tweets.indexOf(tweet);
			if (ind != -1) $scope.tweets.splice(ind, 1);
		};
		
	});
	
	
	//Apply tricky, non-CSS layout: called on load, and if the browser window is resized//
	spiralRoot_position = function() {
		if (! spiralRootDomRef) spiralRootDomRef = window.document.getElementById("spiral_root");
		if (! asideRef) asideRef = window.document.getElementsByTagName("aside")[0];
		var asideHeight, trueInnerW, trueInnerH, smallest, tString;
		
		smallScreen = window.innerWidth < smallScreenThreshold;
		
		if (smallScreen) {
			asideHeight = asideRef.getBoundingClientRect().height;
			trueInnerW = window.innerWidth;
			trueInnerH = window.innerHeight - (headerH + asideHeight);
			smallest = Math.min(trueInnerW, trueInnerH);
			spiralRootDomRef.style.left = (0.5 * trueInnerW) + "px";
			spiralRootDomRef.style.top = ((0.5 * trueInnerH) + headerH + asideHeight) + "px";
		} else {
			trueInnerW = window.innerWidth - asideW;
			trueInnerH = window.innerHeight - headerH;
			smallest = Math.min(trueInnerW, trueInnerH);
			spiralRootDomRef.style.left = (0.5 * trueInnerW) + "px";
			spiralRootDomRef.style.top = ((0.5 * trueInnerH) + headerH) + "px";
		}
		
		tString = "scale(" + smallest / ((spiralMaxRad * 2) + spiralScalePad) + ")";
		spiralRootDomRef.style.transform = spiralRootDomRef.style["-webkit-transform"] = spiralRootDomRef.style["-moz-transform"] = spiralRootDomRef.style["-ms-transform"] = tString;
	};
	
	//Set up DOM references and try to dectect whether a mobile device is being used, to enable 'lite' mode and load in fewer tweets at a time//
	page_loaded = function() {
		isLite = /Android|webOS|iPhone|iPad|iPod|BlackBerry|BB|IEMobile|Opera Mini/i.test(window.navigator.userAgent);
		spiralRootDomRef = window.document.getElementById("spiral_root");
		asideRef = window.document.getElementsByTagName("aside")[0];
		spiralRoot_position();
		window.onresize = this.spiralRoot_position;
	};
	
	if (window.document.readyState == "complete") this.page_loaded();
	else window.onload = this.page_loaded;
	
})(window);