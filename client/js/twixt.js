var Twixt = (function () {
	
	/*
	-------------------
	Twixt: tween engine
	-------------------
	
	Modifiers:
		ease	[Default: linear]
		delay	[Default: 0]
		onStart
		onComplete
		onUpdate
		onStartParams
		onCompleteParams
		onUpdateParams
		useInt(TBI)
	
	Special properties:
		
	
	Expected suffixes:
		%
		em, ex, ch, rem
		px, cm, mm, in, pt, pc
		deg, rad, grad, turn
		s, ms
		Hz, kHz
		dpi, dpcm, dppx
		vw, vh, vmin, vmax
		
	*/
	
	
	//Private props and methods//
	/////////////////////////////
	
	//var jobDict = {};					//Provides look-up for jobs
	var jobs = [];						//List of active (or pending) jobs
	var onEventFunctions = [];			//Function refs added here to be executed with each update or after completing
	var onEventParams = [];				//Function params added here to be executed with each update or after completing
	
	var animating = false;				//No new frames processed except while tween jobs are in the list
	var updateMethod = "";				//ID for means of updating frames, determined at runtime
	var frameRate = 60;					//Frames per second, if requestAnimationFrame unavailable
	var frameInterval = 1000/frameRate;	//Interval between frames
	
	var addedTime = 0;					//Last time at which new jobs were added
	var currentFrameTime = 0;			//Time at processing of current frame
	var lastFrameTime = 0;				//Time when last frame came round, if requestAnimationFrame unavailable
	
	var nums = "1234567890.";			//For separating numerals and suffix
	var defaultEase = "linear";			//Default tween easing function
	
	var easeFunctions = {				//Range of easing functions, with arguments: current time, starting value, delta value and total time
		linear: function (ct, sv, dv, tt) { return dv*ct/tt + sv; },
		quadIn: function (ct, sv, dv, tt) { ct /= tt;	return dv*ct*ct + sv; },
		quadOut: function (ct, sv, dv, tt) { ct /= tt; return -dv * ct*(ct-2) + sv; },
		quadInOut: function (ct, sv, dv, tt) { ct /= tt/2; if (ct < 1) return dv/2*ct*ct + sv; ct--; return -dv/2 * (ct*(ct-2) - 1) + sv; },
		cubicIn: function (ct, sv, dv, tt) { ct /= tt; return dv*ct*ct*ct + sv; },
		cubicOut: function (ct, sv, dv, tt) { ct /= tt; ct--; return dv*(ct*ct*ct + 1) + sv; },
		cubicInOut: function (ct, sv, dv, tt) { ct /= tt/2; if (ct < 1) return dv/2*ct*ct*ct + sv; ct -= 2; return dv/2*(ct*ct*ct + 2) + sv; },
		quartIn: function (ct, sv, dv, tt) { ct /= tt; return dv*ct*ct*ct*ct + sv; },
		quartOut: function (ct, sv, dv, tt) { ct /= tt; ct--; return -dv * (ct*ct*ct*ct - 1) + sv; },
		quartInOut: function (ct, sv, dv, tt) { ct /= tt/2; if (ct < 1) return dv/2*ct*ct*ct*ct + sv; ct -= 2; return -dv/2 * (ct*ct*ct*ct - 2) + sv; },
		quintIn: function (ct, sv, dv, tt) { ct /= tt; return dv*ct*ct*ct*ct*ct + sv; },
		quintOut: function (ct, sv, dv, tt) { ct /= tt; ct--; return dv*(ct*ct*ct*ct*ct + 1) + sv; },
		quintInOut: function (ct, sv, dv, tt) { ct /= tt/2; if (ct < 1) return dv/2*ct*ct*ct*ct*ct + sv; ct -= 2; return dv/2*(ct*ct*ct*ct*ct + 2) + sv; },
		sineIn: function (ct, sv, dv, tt) { return -dv * Math.cos(ct/tt * (Math.PI/2)) + dv + sv; },
		sineOut: function (ct, sv, dv, tt) { return dv * Math.sin(ct/tt * (Math.PI/2)) + sv; },
		sineInOut: function (ct, sv, dv, tt) { return -dv/2 * (Math.cos(Math.PI*ct/tt) - 1) + sv; },
		expoIn: function (ct, sv, dv, tt) { return dv * Math.pow( 2, 10 * (ct/tt - 1) ) + sv; },
		expoOut: function (ct, sv, dv, tt) { return dv * ( -Math.pow( 2, -10 * ct/tt ) + 1 ) + sv; },
		expoInOut: function (ct, sv, dv, tt) { ct /= tt/2; if (ct < 1) return dv/2 * Math.pow( 2, 10 * (ct - 1) ) + sv; ct--; return dv/2 * ( -Math.pow( 2, -10 * ct) + 2 ) + sv; },
		circIn: function (ct, sv, dv, tt) { ct /= tt; return -dv * (Math.sqrt(1 - ct*ct) - 1) + sv; },
		circOut: function (ct, sv, dv, tt) { ct /= tt; ct--; return dv * Math.sqrt(1 - ct*ct) + sv; },
		circInOut: function (ct, sv, dv, tt) { ct /= tt/2; if (ct < 1) return -dv/2 * (Math.sqrt(1 - ct*ct) - 1) + sv; ct -= 2; return dv/2 * (Math.sqrt(1 - ct*ct) + 1) + sv; },
		backIn: function (ct, sv, dv, tt) { var s = 1.70158; return dv*(ct/=tt)*ct*((s+1)*ct - s) + sv; },
		backOut: function (ct, sv, dv, tt) { var s = 1.70158; return dv*((ct=ct/tt-1)*ct*((s+1)*ct + s) + 1) + sv; },
		backInOut: function (ct, sv, dv, tt) { var s = 1.70158; if ((ct/=tt/2) < 1) return dv/2*(ct*ct*(((s*=(1.525))+1)*ct - s)) + sv; return dv/2*((ct-=2)*ct*(((s*=(1.525))+1)*ct + s) + 2) + sv; }
	}
	
	
	function animation_start() {
		if (updateMethod == "") updateMethod_select();
		
		currentFrameTime = addedTime;
		animating = true;
		engine_update();
	}
	
	function updateMethod_select() {
		//TBI...//
		updateMethod = "FALLBACK";
	}
	
	function frame_requestNext() {
		//Perform next frame request appropriate to the update method//
		if (updateMethod == "FALLBACK") {
			var targetInterval = Math.max(frameInterval - (currentFrameTime - lastFrameTime), 0);
			setTimeout(engine_update, targetInterval);
			lastFrameTime = currentFrameTime + targetInterval;
		} else {
			//TBI
		}
	}
	
	function engine_update() {
		//Capture new time//
		currentFrameTime = new Date().getTime();
		
		//Update all jobs//
		var numJobs = jobs.length;
		for (var i = 0; i < numJobs; i++) {
			job_update(jobs[i]);
		}
		
		//Execute on update / complete functions, if supplied, then clear list//
		var numFuncs = onEventFunctions.length;
		for (var i2 = 0; i2 < numFuncs; i2++) {
			onEventFunctions[i2].apply(null, onEventParams[i2]);
		}
		onEventFunctions = [];
		onEventParams = [];
		
		//Remove any finished jobs//
		for (var i3 = numJobs-1; i3 > -1; i3--) {
			if (jobs[i3].finished) {
				jobs.splice(i3, 1);
			}
		}
		
		//Request another frame only if there is more work to do//
		if (jobs.length != 0) {
			frame_requestNext();
		} else {
			animating = false;
		}
	}
	
	function job_update(job) {
		//Calculate current time, no higher than the total time//
		cT = Math.min(currentFrameTime - job.sT, job.tT);
		
		//If tween isn't due to start yet, abort without updating//
		if (cT < 0) return;
		
		//Set new property value based on progress through tween and selected ease function//
		if (job.tT == 0) {
			job.target[job.property] = job.sV + job.dV + job.suffix;
		} else {
			job.target[job.property] = easeFunctions[job.ease](cT, job.sV, job.dV, job.tT) + job.suffix;
		}
		
		//If present, add onStart function to the array for execution after all updates have been made, then remove so not called twice//
		if (job.onStart) {
			onEventFunctions.push(job.onStart);
			onEventParams.push(job.onStartParams);
			job.onStart = undefined;
			job.onStartParams = undefined;
		}
		
		//If present, add onUpdate function to the array for execution after all updates have been made//
		if (job.onUpdate) {
			onEventFunctions.push(job.onUpdate);
			onEventParams.push(job.onUpdateParams);
		}
		
		//If the tween has finished, mark the job for removal, if present, add onComplete function to array for subsequnt execution//
		if (cT >= job.tT) {
			job.finished = true;
			if (job.onComplete) {
				onEventFunctions.push(job.onComplete);
				onEventParams.push(job.onCompleteParams);
			}
		}
	}
	
	function job_add(target, property, sT, tT, sV, eV, ease, onStart, onUpdate, onComplete, onStartParams, onUpdateParams, onCompleteParams) {
		//Record and remove any suffixes//
		var suffix = suffix_detect(sV);
		sV = parseFloat(sV);
		eV = parseFloat(eV);
		
		//Record delta value//
		var dV = eV - sV;
		
		//Process for special properties//
		//...
		
		//Set up job object / jobject//
		var job = {
			target:target,
			property:property,
			sT:sT,
			tT:tT,
			sV:sV,
			dV:dV,
			suffix:suffix,
			ease:ease,
			finished:false,
			onStart:onStart,
			onUpdate:onUpdate,
			onComplete:onComplete,
			onStartParams:onStartParams,
			onUpdateParams:onUpdateParams,
			onCompleteParams:onCompleteParams
		}
		
		//Add job to dictionary, overwriting any existing//
		var numJobs = jobs.length;
		for (var i = 0; i < numJobs; i++) {
			if ((jobs[i].target === job.target) && (jobs[i].property === job.property)) {
				jobs.splice(i, 1);
				break;
			}
		}
		jobs.push(job);
		
	}
	
	function suffix_detect(value) {
		//Return empty suffix if value is of a numeric type or otherwise not a string//
		if (typeof value != "string") return "";
		
		var suffStart = 0;
		var hasSuffix = false;
		
		//Check where in the string the numerals end and suffix begins, if present//
		for (var i = value.length - 1; i > -1; i--) {
			if (nums.indexOf(value.charAt(i)) != -1) {
				suffStart = i + 1;
				break;
			} else {
				hasSuffix = true;
			}
		}
		
		//Return trimmed suffix if present//
		if (hasSuffix) return value.substr(suffStart);
		else return "";
	}
	
	function object_duplicate(properties) {
		var duplicate = {};
		for (var property in properties) {
			duplicate[property] = properties[property];
		}
		return duplicate;
	}
	
	function to(target, duration, properties) {
		properties = object_duplicate(properties);
		
		//Capture delay prop or set 0//
		var delay = 0;
		if ("delay" in properties) {
			if (properties.delay > 0) delay = properties.delay * 1000;
			delete properties.delay;
		}
		
		//Initialise start and end time props//
		addedTime = new Date().getTime();
		var sT = addedTime + delay;
		var tT = duration * 1000;
		
		//Capture ease or set default//
		var ease = defaultEase;
		if ("ease" in properties) {
			if (properties.ease in easeFunctions) ease = properties.ease;
			else console.log("Unknown ease function supplied");
			delete properties.ease;
		}
		
		//Capture any function modifiers//
		var onStart;
		var onUpdate;
		var onComplete;
		var onStartParams = [];
		var onUpdateParams = [];
		var onCompleteParams = [];
		if ("onStart" in properties) {
			onStart = properties.onStart;
			delete properties.onStart;
		}
		if ("onUpdate" in properties) {
			onUpdate = properties.onUpdate;
			delete properties.onUpdate;
		}
		if ("onComplete" in properties) {
			onComplete = properties.onComplete;
			delete properties.onComplete;
		}
		if ("onStartParams" in properties) {
			onStartParams = properties.onStartParams;
			delete properties.onStartParams;
		}
		if ("onUpdateParams" in properties) {
			onUpdateParams = properties.onUpdateParams;
			delete properties.onUpdateParams;
		}
		if ("onCompleteParams" in properties) {
			onCompleteParams = properties.onCompleteParams;
			delete properties.onCompleteParams;
		}
		
		//Create jobs for all non-modifier properties//
		var addedFunctions = false;
		for (var property in properties) {
			if (! addedFunctions) {
				job_add(target, property, sT, tT, target[property], properties[property], ease, onStart, onUpdate, onComplete, onStartParams, onUpdateParams, onCompleteParams);
				addedFunctions = true;
			} else {
				job_add(target, property, sT, tT, target[property], properties[property], ease);
			}
		}
		
		//If not animating currently, start//
		if (! animating) animation_start();
	}
	
	
	//Public interface//
	////////////////////
	
	return {
		to:to
	};
	
})();