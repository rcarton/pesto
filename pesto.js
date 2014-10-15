/**
 *  Pesto
 * -------
 * The thing that reads Rachel's weird csvs.
 *
 */

function BasilData(data) {
    // remove the first row
    var self = this;
    self.data = _.rest(data);
    self.books = {};
    self.extraBooks = [];

    var keys = ["id", 
                "barcode",
                "title",
                "authors",
                "condition",
                "section",
                "location",
                "onHand",
                "price",
                "cost",
                "cash",
                "credit",
                "firstIn",
                "lastIn",
                "lastSold",
                "user"];

    var makeBook = function(bookRow) {
        var book = _.zipObject(keys, bookRow);
        book.found = 0;
        book.onHand = parseInt(book.onHand);
        book.foundNoExtra = 0;
        if (book.barcode) {
            self.books[book.barcode] = book;
        }
        book.price = parseFloat(book.price.substr(1));
    };

    _.forEach(this.data, makeBook);
}

BasilData.prototype.loadBarcodes = function(barcodes) {
    var self = this;
    self.barcodes = barcodes;
    _.forEach(barcodes, function(codeRow) {
        var barcode = codeRow[0].toString();
        var book = self.books[barcode];

        // Compare the last 10 digits if not found
        if (!book) {
            var barcodeShort = barcode.substr(3, 9);
            console.log('Trying ' + barcodeShort);
            key = _.find(_.keys(self.books), function(bookCode) {
                return  barcodeShort == bookCode.substr(0, 9);
            });

            if (key) {
                console.log('Found :' + barcode + ' == ' + key);
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
        'stats': self.stats
    };
    var html = template(context);
    $('#basil-render').html(html);
};
BasilData.prototype.computeStats = function() {
    console.log('Computing stats..');
    var self = this;
    var stats = {};
    stats.numBooks = 0;
    stats.numBarcodesRead = self.barcodes.length;
    stats.missing = 0;
    stats.found = 0;
    stats.extra = 0;
    stats.totalDollarBefore = 0;
    stats.totalDollarAfter = 0;

    _.forEach(self.books, function(book) {
        stats.numBooks += book.onHand;
        stats.found += book.found;
        if (book.found > book.onHand) stats.extra += book.found - book.onHand;
        if (book.found < book.onHand) stats.missing += book.onHand - book.found;
        stats.totalDollarBefore += book.onHand * book.price;
        stats.totalDollarAfter += book.foundNoExtra * book.price;
    });

    stats.foundNoExtra = stats.found - stats.extra;
    stats.totalDollarRemoved = stats.totalDollarBefore - stats.totalDollarAfter;
    
    stats.percentDollarRemoved = stats.totalDollarAfter / stats.totalDollarBefore * 100;
    stats.percentDollarRemoved = stats.percentDollarRemoved.toFixed(2);

    stats.percentBooksRemoved = (stats.foundNoExtra / stats.numBooks * 100);
    stats.percentBooksRemoved = stats.percentBooksRemoved.toFixed(2);

    stats.totalDollarBefore = stats.totalDollarBefore.toFixed(2);
    stats.totalDollarAfter = stats.totalDollarAfter.toFixed(2);
    stats.totalDollarRemoved = stats.totalDollarRemoved.toFixed(2);

    self.stats = stats;
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

    console.log('Creating inventory..')
    window.basilData = new BasilData(parsed);

    //console.log(basilData);
    $('.barcode-input').show();
} 

function barcodeHandler(e) {
    console.log('Reading barcode file..');

    var data = e.target.result;

    console.log('Parsing barcode csv..');
    var csv = new CSV(data);
    var parsed = csv.parse();

    //console.log(parsed);

    basilData.loadBarcodes(parsed);
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

document.getElementById('basil-file').addEventListener('change', handleFileSelectCurry(basilHandler), false);
document.getElementById('barcode-file').addEventListener('change', handleFileSelectCurry(barcodeHandler), false);


