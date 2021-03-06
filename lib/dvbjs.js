var request = require('request');

module.exports = function() {

    module.monitor = function(stop,offset,amount,callback){

        // remove whitespace, vvo-online.de handles all kinds of requests pretty nicely
        stop = stop.replace(/ /g, '');

        // hst = name of bus- or tramstop, e.g. 'Helmholtzstraße'
        // vz = time offset from now; trims the beginning of the array
        // lim = limit the amount of results, max seems to be 31
        var url = 'http://widgets.vvo-online.de/abfahrtsmonitor/Abfahrten.do?hst=' + stop + '&vz=' + offset + '&lim=' + amount;

        request(url, function(err, res, data){
            if (err) return callback(err);

            data = JSON.parse(data);
            var json = [];
            for (var i = 0; i < data.length; i++) {
                json.push({line: data[i][0], direction: data[i][1], arrivaltime: parseInt(data[i][2])});
            }

            callback(null, json);
        });
    };

    module.route = function(origin, destination, time, deparr, callback) {

        origin = origin.replace(/ /g, '');
        destination  = destination.replace(/ /g, '');

        var year   = time.getFullYear();
        var month  = time.getMonth() + 1;
        if (month < 10) month = '0' + month;
        var day    = time.getDate();
        var hour   = time.getHours();
        var minute = time.getMinutes();

        if (deparr === 0) {
            deparr = 'dep';
        } else {
            deparr = 'arr';
        }

        // API docs: http://data.linz.gv.at/katalog/linz_ag/linz_ag_linien/fahrplan/LINZ_LINIEN_Schnittstelle_EFA_V1.pdf
        // found here -> http://www.nise81.com/archives/2674
        var url = 'http://efa.vvo-online.de:8080/dvb/XML_TRIP_REQUEST2?sessionID=0&requestID=0&language=de&execInst=normal&command=&ptOptionsActive=-1&itOptionsActive=&itDateDay=' + day + '&itDateMonth=' + month + '&itDateYear=' + year + '&place_origin=Dresden&placeState_origin=empty&type_origin=stop&name_origin=' + origin + '&nameState_origin=empty&place_destination=Dresden&placeState_destination=empty&type_destination=stop&name_destination=' + destination + '&nameState_destination=empty&itdTripDateTimeDepArr=' + deparr + '&itdTimeHour=' + hour + '&idtTimeMinute=' + minute + '&outputFormat=JSON&coordOutputFormat=WGS84&coordOutputFormatTail=0';
        request(url, function(err, res, data){
            if (err) return callback(err);

            try {
                data = JSON.parse(data);
            } catch (e) {
                return callback(e);
            }

            var json = {origin: data.origin.points.point.name, destination: data.destination.points.point.name, trips: []};

            // iterate over all trips for this route
            for (var i = 0; i < data.trips.length; i++) {

                var departure   = data.trips[i].legs[0].points[0].dateTime.time;
                var arrival     = data.trips[i].legs[data.trips[i].legs.length - 1].points[data.trips[i].legs[data.trips[i].legs.length - 1].points.length - 1].dateTime.time;
                var duration    = data.trips[i].duration;
                var interchange = parseInt(data.trips[i].interchange);

                var trip = {
                    departure: departure,
                    arrival: arrival,
                    duration: duration,
                    interchange: interchange,
                    nodes: []
                };

                // iterate over the single elements of this route (e.g. bus -> tram -> bus -> on foot etc.)
                for (var j = 0; j < data.trips[i].legs.length; j++) {

                    var mode            = data.trips[i].legs[j].mode.product;
                    var line            = data.trips[i].legs[j].mode.number;
                    var direction       = data.trips[i].legs[j].mode.destination;

                    if (data.trips[i].legs[j].path) {
                        var path = data.trips[i].legs[j].path;
                        path = path.split(' ');

                        for (var k = 0; k < path.length; k++) {
                            path[k] = convertCoords(path[k]);
                        }
                    }

                    var departure = {
                        stop: data.trips[i].legs[j].points[0].nameWO,
                        time: data.trips[i].legs[j].points[0].dateTime.time,
                        coords: convertCoords(data.trips[i].legs[j].points[0].ref.coords)
                    };

                    var arrival = {
                        stop: data.trips[i].legs[j].points[1].nameWO,
                        time: data.trips[i].legs[j].points[1].dateTime.time,
                        coords: convertCoords(data.trips[i].legs[j].points[1].ref.coords)
                    };

                    var node = {
                        mode: mode,
                        line: line,
                        direction: direction,
                        departure: departure,
                        arrival: arrival,
                        path: path
                    };

                    trip.nodes.push(node);
                }

                json.trips.push(trip);
            }

            callback(null, json);
        });
    };

    module.find = function(searchString, callback) {

        searchString = searchString.replace(/ /g, '');

        // for coordinates see this as well: http://data.linz.gv.at/katalog/linz_ag/linz_ag_linien/fahrplan/LINZ_AG_LINIEN_Schnittstelle_EFA_Koordinaten.pdf
        var url = 'http://efa.vvo-online.de:8080/dvb/XML_STOPFINDER_REQUEST?locationServerActive=1&outputFormat=JSON&type_sf=any&name_sf=' + searchString + '&coordOutputFormat=WGS84&coordOutputFormatTail=0';

        request(url, function(err, res, data){
            if (err) return callback(err);
            try {
                data = JSON.parse(data);
            } catch (e) {
                return callback(err);
            }

            var json = [];

            if (Array.isArray(data.stopFinder.points)) {
                for (var i = 0; i < data.stopFinder.points.length; i++) {
                    if (data.stopFinder.points[i].posttown === 'Dresden') {
                        json.push({stop: data.stopFinder.points[i].object, coords: convertCoords(data.stopFinder.points[i].ref.coords)});
                    }
                }
            } else {
                if (data.stopFinder.points.point.posttown === 'Dresden') {
                    json.push({stop: data.stopFinder.points.point.object, coords: convertCoords(data.stopFinder.points.point.ref.coords)});
                }
            }

            callback(null, json);
        });

    };

    return module;
};

function convertCoords(coords) {
    var array = coords.split(',');
    array.reverse();

    for (var i = 0; i < 2; i++) {
        array[i] = parseInt(array[i]);
        array[i] = array[i] / 1000000;
    }

    return array;
}
