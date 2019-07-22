Thought-Toilet
==============

A web app for viewing trending tweets in realtime made with HTML5, CSS3, AngularJS and Node.js

Currently hosted here: https://admvx.com/toilet

This app comprises:
- A Node.js server application
    - Connects to the Twitter API (add your own Twitter app credentials)
    - Downloads current trends every 10mins
    - Streams in all tweets containing any of those trends
    - Uses a socket.io server to pass on data
- A client-side app
    - Consumes realtime Twitter data from Node.js app
    - Uses AngularJS for 2-way data binding
    - Has custom JS/CSS animation for spiral effect
    - Uses CSS3 media queries for its responsive layout
