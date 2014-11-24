/**
 *  Pesto
 * -------
 * The thing that reads Rachel's weird csvs.
 *
 */

function BasilData() {
    // remove the first row
    var self = this;

    self.books = {};
    self.extraBooks = [];
    self.basilFiles = {};
    self.barcodeFiles = {};
    self.barcodes = [];

    self.keys = ["id", 
                "barcode",
                "title",
                "authors",
                "publisher",
                "pubDate",
                "binding",
                "condition",
                "section",
                "location",
                "itemTypeId",
                "onHand",
                "price",
                "cost",
                "cash",
                "credit",
                "firstIn",
                "lastIn",
                "lastSold",
                "metaTags",
                "keywords",
                "user"];


}

BasilData.prototype.loadBasilFile = function(filename, data) {
    var self = this;
    var data = _.rest(data);

    var makeBook = function(bookRow) {
        var book = _.zipObject(self.keys, bookRow);
        book.found = 0;
        book.onHand = parseInt(book.onHand);
        book.foundNoExtra = 0;
        if (book.barcode) {
            self.books[book.barcode] = book;
        }
        book.price = parseFloat(book.price.substr(1));
        // Book lastIn was within 7 days
        book.isRecent = Math.abs(new Date() - new Date(book.lastIn)) < 604800000;
    };

    self.basilFiles[filename] = data;
    _.forEach(data, makeBook);
    self.computeStats();
};

BasilData.prototype.loadBarcodes = function(filename, barcodes) {
    var self = this;
    self.barcodes = self.barcodes.concat(barcodes);
    self.barcodeFiles[filename] = barcodes;
    _.forEach(barcodes, function(codeRow) {
        var barcode = codeRow[0].toString();
        var book = self.books[barcode];

        // Compare the last 10 digits if not found
        if (!book) {
            var barcodeShort = barcode.substr(3, 9);
            //console.log('Trying ' + barcodeShort);
            key = _.find(_.keys(self.books), function(bookCode) {
                return  barcodeShort == bookCode.substr(0, 9);
            });

            if (key) {
                //console.log('Found :' + barcode + ' == ' + key);
                book = self.books[key];
            }
        }

        if (book) {
            book.found += 1;
        } else {
            // Add to extraBooks
            self.extraBooks.push(barcode);
        }
    });

    // Compute delta
    _.forEach(self.books, function(book) {
        book.delta = book.found - book.onHand;
        book.difference = book.delta !== 0;
        book.foundNoExtra = book.found > book.onHand ? book.onHand : book.found;
    });

    self.computeStats();
};
BasilData.prototype.render = function() {
    var self = this;
    var source   = $("#book-list-template").html();
    var template = Handlebars.compile(source);
    var books = _.values(self.books);
    //books = _.sortBy(books, 'authors');
    books.sort(function (a, b) {
        return a.authors.toLowerCase().localeCompare(b.authors.toLowerCase());
    });

    var context = {
        'books': books,
        'extraBooks': self.extraBooks,
        'stats': self.stats,
        'statsBySection': self.statsBySection,
        'barcodeFiles': _.keys(self.barcodeFiles),
        'basilFiles': _.keys(self.basilFiles)
    };
    var html = template(context);
    $('#basil-render').html(html);
    $('#basil-render .collapsed').click(function() { $(this).removeClass('collapsed'); });
};
BasilData.prototype.computeStats = function() {
    console.log('Computing stats..');
    var self = this;
    var stats = {};
    var statsBySection = {};

    var initStats = function(statsObj) {
        statsObj.numBooks = 0;
        statsObj.numBarcodesRead = self.barcodes.length;
        statsObj.missing = 0;
        statsObj.found = 0;
        statsObj.extra = 0;
        statsObj.totalDollarBefore = 0;
        statsObj.totalDollarAfter = 0;
    };

    var updateStatsForBook = function(statsObj, book) {
        // For recent books, don't count missing ones because they might not have been shelved yet
        if (self.barcodeFiles.length == 0 && book.isRecent && book.found < book.onHand) {
            book.found = book.onHand;
        }

        statsObj.numBooks += book.onHand;
        statsObj.found += book.found;
        if (book.found > book.onHand) statsObj.extra += book.found - book.onHand;
        if (book.found < book.onHand) statsObj.missing += book.onHand - book.found;
        statsObj.totalDollarBefore += book.onHand * book.price;
        statsObj.totalDollarAfter += book.found * book.price;
    };

    var finalizeStats = function(statsObj) {
        statsObj.foundNoExtra = statsObj.found - statsObj.extra;
        statsObj.totalDollarRemoved = statsObj.totalDollarBefore - statsObj.totalDollarAfter;
        
        statsObj.percentDollarRemoved = (statsObj.totalDollarBefore - statsObj.totalDollarAfter) / statsObj.totalDollarBefore * 100;
        statsObj.percentDollarRemoved = statsObj.percentDollarRemoved.toFixed(2);

        statsObj.percentBooksRemoved = (statsObj.numBooks - statsObj.found) / statsObj.numBooks * 100;
        statsObj.percentBooksRemoved = statsObj.percentBooksRemoved.toFixed(2);

        statsObj.totalDollarBefore = statsObj.totalDollarBefore.toFixed(2);
        statsObj.totalDollarAfter = statsObj.totalDollarAfter.toFixed(2);
        statsObj.totalDollarRemoved = statsObj.totalDollarRemoved.toFixed(2);
    };

    // Initialize the global stats
    initStats(stats);

    // Find the different sections
    var sections = _.keys(_.groupBy(self.books, 'section'));
    _.forEach(sections, function(section) {
        statsBySection[section] = {};
        initStats(statsBySection[section]);
    });

    // Compute the stats book by book
    _.forEach(self.books, function(book) {
        updateStatsForBook(stats, book);
        updateStatsForBook(statsBySection[book.section], book);
    });

    // Finalize the global stats
    finalizeStats(stats);

    // Finalize the stats per section
    _.forOwn(statsBySection, finalizeStats);

    self.stats = stats;
    self.statsBySection = statsBySection;
};


function basilHandler(e) {
    console.log('Reading file..');

    var data = e.target.result;
    var options = {
        cellDelimiter: '\t'
    };

    console.log('Parsing basil csv..');
    var csv = new CSV(data, options);
    var parsed = csv.parse();

    console.log('Creating inventory..');
    var filename = $($('#basil-file').val().split(/[\\/]/)).last()[0];
    basilData.loadBasilFile(filename, parsed);

    $('#basil-file').val('');
    $('.barcode-input').show();
    basilData.render();
} 

function barcodeHandler(e) {
    console.log('Reading barcode file..');

    var data = e.target.result;

    console.log('Parsing barcode csv..');
    var csv = new CSV(data);
    var parsed = csv.parse();

    // Hacky.
    var filename = $($('#barcode-file').val().split(/[\\/]/)).last()[0];
    $('#barcode-file').val('');

    basilData.loadBarcodes(filename, parsed);
    basilData.render();
} 

function handleFileSelect(evt, handler) {
    var file = evt.target.files[0]; // FileList object
    var reader = new FileReader();

    reader.readAsText(file);
    reader.onload = handler;
}

var handleFileSelectCurry = function(handler) {
    return function(e) {
        handleFileSelect(e, handler);
    };
};

function toggleDifference() {
    $('#book-list tbody tr:not(.difference)').toggleClass('no-difference-hidden');
}

document.getElementById('basil-file').addEventListener('change', handleFileSelectCurry(basilHandler), false);
document.getElementById('barcode-file').addEventListener('change', handleFileSelectCurry(barcodeHandler), false);


window.basilData = new BasilData();