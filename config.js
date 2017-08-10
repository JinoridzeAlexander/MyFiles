/* --- scripts load & preporation --- */

// Load common javascript
head.load("https://ajax.googleapis.com/ajax/libs/jquery/3.2.1/jquery.min.js");
head.load("https://cdnjs.cloudflare.com/ajax/libs/ramda/0.24.1/ramda.min.js");
head.load("https://cdnjs.cloudflare.com/ajax/libs/svg.js/2.6.3/svg.min.js");
head.load("js/lib/jquery.fullscreen.js");
head.load("js/lib/js.cookie.js");
head.load({
    'moment': "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.18.1/moment.min.js"
});
head.load({
    'money': "js/lib/money.min.js"
});
head.load("js/app/main.js");

// Load common css
head.load("css/style.css");

// Create page-specific javascript and css
(function() {
    var html = document.getElementsByTagName('html')[0],
        headScript = document.getElementsByTagName('script')[0],
        isArray = function(val) {
            return Object.prototype.toString.call(val) === '[object Array]'
        },
        isObject = function(val) {
            return Object.prototype.toString.call(val) === '[object Object]'
        },
        walk = (function() {
            var result = [];
            return function walk(obj) {
                for (prop in obj) {
                    var cur = obj[prop];
                    if (isArray(cur) || isObject(cur)) {
                        walk(cur);
                    } else {
                        var t = {};
                        t[prop] = cur;
                        result.push(t);
                    }
                }
                return result;
            }
        }());
    head.load(walk(JSON.parse(html.dataset.jsl)));
    html.removeAttribute('data-jsl');
}());



/* --- additional initializations --- */

// Create global variable for website
Object.defineProperty(window, 'global', {
    value: {}
});

// Current language mode of website
Object.defineProperty(global, 'lang', {
    value: document.documentElement.getAttribute('lang')
});

// Finances configuration and availability for website
Object.defineProperty(global, 'finances', {
    value: {
        status: false, // Will URL be valid or not
        error: undefined, // Error object if any occurs
        currencies: ['USD', 'EUR', 'GBP', 'RUB', 'AMD', 'AZN', 'TRY'] //required currencies used in website (based on Georgian lari (GEL))
    }
});



// Prepare money-js library to work with currencies listed in global.finances.currencies array
head.ready(['moment', 'money'], function() {
    var currencyDataUpdateEvent = new CustomEvent("currencyDataUpdate"),
        fxLoaded = new CustomEvent("fxLoaded"),
        isFxExist = false;


    (function worker(date) {
        var date = date || moment().valueOf(),
            currenciesUrl = global.finances.currencies.join(',');
        $.ajax({
                url: "https://lari.jumpstart.ge/en/api/v1/nbg_rates?currency=" + currenciesUrl + "&start_date=" + date + "&end_date=" + date,
                type: 'GET',
                dataType: 'jsonp'
            })
            .done(function(data) {
                if (data['valid']) {
                    var data = data['result'],
                        result = {
                            GEL: 1
                        };

                    global.finances.status = true;

                    for (prop in data) {
                        result[data[prop]['code']] = data[prop]['rates'][0][1] / data[prop]['ratio'];
                    }

                    fx.base = 'GEL';
                    fx.rates = result;

                } else {
                    if (!global.finances.status) {
                        var error = global.finances.error = data.errors[0];

                        if (error.code === 2002) {
                            worker(moment().subtract(1, 'day').valueOf());
                        }
                    }
                }
            })
            .fail(function() {
                global.finances.status = false;
            })
            .always(function() {
                var error = global.finances.error;
                if (global.finances.status) {
                    if (!isFxExist) {
                        document.dispatchEvent(fxLoaded);
                        isFxExist = true;
                    };
                    setTimeout(function() {
                        document.dispatchEvent(currencyDataUpdateEvent);
                        worker();
                    }, moment().startOf('hours').add(1, 'hours').valueOf() - moment().valueOf());
                } else if (error !== undefined && error.code !== 2002) {
                    error && console.error('code->', error.code, '  field->', error.field, '  message->', '"' + error.message + '"');
                }
            });
    }());


    global.fxReady = function(f, context) {
        if (fx.base) {
            f.call(context, fx);
        } else {
            document.addEventListener("fxLoaded", function() {
                f.call(context, fx);
            });
        }
    };

    global.currencyLiveUpdate = function(f, context) {
        global.fxReady(f, context);
        document.addEventListener("currencyDataUpdate", function() {
            f.call(context, fx);
        });
    };

    global.historyRates = function(start, end) {
        var end = arguments.length === 1 ? start : end;
        if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /\d{4}-\d{2}-\d{2}/.test(end)) {
            var start = moment(start).add(1, 'days'),
                end = moment(end).add(1, 'days'),
                currenciesUrl = global.finances.currencies.join(',');
            if (start.isValid() && end.isValid()) {
                var result = {};
                $.ajax({
                        url: "https://lari.jumpstart.ge/en/api/v1/nbg_rates?currency=" + currenciesUrl + "&start_date=" + start.valueOf() + "&end_date=" + end.valueOf(),
                        type: 'GET',
                        dataType: 'jsonp'
                    })
                    .done(function(data) {
                        if (data['valid']) {
                            var mainVal = data['result'];

                            for (prop in mainVal) {
                                var curProp = mainVal[prop],
                                    curPropCode = result[curProp['code']] = [],
                                    curPropRates = curProp['rates'];

                                for (var i = curPropRates.length - 1; i--;) {
                                    curPropCode.push(curPropRates[i][1] / curProp['ratio']);
                                }
                            }
                        } else {
                            var error = data.errors[0];
                            throw new Error('code->' + error.code + '  field->' + error.field + '  message->' + '"' + error.message + '"');
                        }
                    });
                return result;
            } else {
                throw new Error('historyRates: One of the supplied data is not valid');
            }
        } else {
            throw new Error('historyRates: Date format needs to be such YYYY-MM-DD');
        }
    };


    moment.locale(global.lang); // Set locales for moment-js
});


head.ready('numeral', function() {
    // Adding support of Georgian language to numeral-js
    numeral.register('locale', 'ka', {
        delimiters: {
            thousands: ',',
            decimal: '.'
        },
        abbreviations: {
            thousand: ' ათასი',
            million: ' მილიონი',
            billion: ' მილიარდი',
            trillion: ' ტრილიონი'
        },
        ordinal: function(number) {
            return (number === 0) ? number : (number === 1) ? '-ელი' : (number < 20 || (number <= 100 && number % 20 === 0)) ? 'მე-' : '-ე'
        },
        currency: {
            symbol: '₾'
        }
    });
    numeral.register('format', 'რიგითი', {
        regexps: {
            format: /(რ)/
        },
        format: function(value) {
            return (value === 0) ? value : (value === 1) ? value + '-ელი' : (value < 20 || (value <= 100 && value % 20 === 0)) ? 'მე-' + value : value + '-ე'
        }
    });

    numeral.locale(global.lang); // Set locales for numeral-js
});
