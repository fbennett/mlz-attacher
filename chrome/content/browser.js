var ZoteroAttacher = new function () {

    this.init = init;
    this.chromeLoad = chromeLoad;
    this.updateStatus = updateStatus;
    this.contentHide = contentHide;
    this.scrapeThisPage = scrapeThisPage;


	/**
	 * Initialize some variables and prepare event listeners for when chrome is done loading
	 */
	function init() {
		if (!Zotero || !Zotero.initialized || !window.hasOwnProperty("gBrowser")) {
			return;
		}
		window.addEventListener("load",
			function(e) { ZoteroAttacher.chromeLoad(e) }, false);
	}
	
	/*
	 * When chrome loads, register our event handlers with the appropriate interfaces
	 */
	function chromeLoad() {
		this.tabbrowser = gBrowser;
		this.appcontent = document.getElementById("appcontent");
		this.statusImage = document.getElementById("attacher-status-image");
		
		gBrowser.tabContainer.addEventListener("TabSelect",
			function(e) {
				ZoteroAttacher.updateStatus();
			}, false);

		// this is for pageshow, for updating the status of the book icon
		this.appcontent.addEventListener("pageshow", contentLoad, false);

		// this is for turning off the book icon when a user navigates away from a page
		this.appcontent.addEventListener("pagehide",
			function(e) {
				ZoteroAttacher.contentHide(e);
			}, true);
	}
	
    function contentLoad (event) {
		var doc = event.originalTarget;
		var isHTML = doc instanceof HTMLDocument;
		var rootDoc = (doc instanceof HTMLDocument ? doc.defaultView.top.document : doc);
		var browser = ZoteroAttacher.tabbrowser.getBrowserForDocument(rootDoc);
		if(!browser) return;

		var tab = _getTabObject(browser);
        if (doc.defaultView.top.document === doc) {
		    if (tab.detectItemID(doc)) {
		        updateStatus();
            }
        }
    }
		
	/*
	 * called to unregister Zotero icon, etc.
	 */
	function contentHide(event) {
		var doc = event.originalTarget;
		if(!(doc instanceof HTMLDocument)) return;
	
		var rootDoc = (doc instanceof HTMLDocument ? doc.defaultView.top.document : doc);
		var browser = ZoteroAttacher.tabbrowser.getBrowserForDocument(rootDoc);
		if(!browser) return;
		
		var tab = _getTabObject(browser);
		if(!tab) return;
		
		// update status
		if(ZoteroAttacher.tabbrowser.selectedBrowser == browser) {
			updateStatus();
		}
	}
	
	/*
	 * Gets a data object given a browser window object
	 */
	function _getTabObject(browser) {
		if(!browser) return false;
		if(!browser.attacherBrowserData) {
			browser.attacherBrowserData = new ZoteroAttacher.Tab(browser);
		}
		return browser.attacherBrowserData;
	}
	
	function scrapeThisPage() {
		if (Zotero.locked) {
			ZoteroAttacher.progress.changeHeadline(Zotero.getString("ingester.scrapeError"));
			var desc = Zotero.localeJoin([
				Zotero.getString('general.operationInProgress'),
				Zotero.getString('general.operationInProgress.waitUntilFinishedAndTryAgain')
			]);
			ZoteroAttacher.progress.addDescription(desc);
			ZoteroAttacher.progress.show();
			ZoteroAttacher.progress.startCloseTimer(8000);
			return;
		}
		
		if (!Zotero.stateCheck()) {
			ZoteroAttacher.progress.changeHeadline(Zotero.getString("ingester.scrapeError"));
			var desc = Zotero.getString("ingester.scrapeErrorDescription.previousError")
				+ ' ' + Zotero.getString("general.restartFirefoxAndTryAgain", Zotero.appName);
			ZoteroAttacher.progress.addDescription(desc);
			ZoteroAttacher.progress.show();
			ZoteroAttacher.progress.startCloseTimer(8000);
			return;
		}
		
        // XXX Attach to item specified in tab document
		var tab = _getTabObject(ZoteroAttacher.tabbrowser.selectedBrowser);
        var attachmentdoc = tab.attachDoc();
	}

	/*
	 * Updates the status of the capture icon to reflect the scrapability or lack
	 * thereof of the current page
	 */
	function updateStatus(forceOff) {
		var tab = _getTabObject(ZoteroAttacher.tabbrowser.selectedBrowser);
		var attachIcon = tab.getAttachIcon();
		if(attachIcon && !forceOff) {
			ZoteroAttacher.statusImage.src = "chrome://zotero-attacher/skin/attachme.png"
			ZoteroAttacher.statusImage.tooltipText = "Attach to: " + tab.page.item.getDisplayTitle();
			ZoteroAttacher.statusImage.hidden = false;
		} else {
			ZoteroAttacher.statusImage.hidden = true;
		}
	}
	
	/**
	 * Called when status bar icon is right-clicked
	 */
	this.onStatusPopupShowing = function(e) {}

}

ZoteroAttacher.Tab = function(browser) {
	this.browser = browser;
	this.page = new Object();
}

ZoteroAttacher.Tab.prototype.getAttachIcon = function() {
    try {
        var item = ZoteroPane.itemsView.getSelectedItems()[0];

        // Grab the parent, if any: we're not interested in attachment properties here.
        if (item) {
            var parentID = item.getSource();
            item = parentID ? Zotero.Items.get(parentID) : item;
            if (item.getField('url') === this.page.taburl && (this.page.pdfURL || this.page.parasList || this.page.block || this.page.rawParasList)) {
                this.page.item = item;
                return true;
            }
        }
        this.page.item = false;
    } catch (e) {
        dump("XXX Failure in getAttachIcon(): " + e + "\n");
    }
    return false;
}

ZoteroAttacher.Tab.prototype.detectItemID = function(doc) {	
    var ret = false;
	if(doc instanceof HTMLDocument && doc.documentURI.substr(0, 6) != "about:") {
        this.page.taburl = doc.documentURI;
        this.page.pdfURL = false;
        this.page.parasList = false;
        this.page.rawParasList = false;
        this.page.block = false;

        this.page.doc = doc;
        // XXXX Get page title
        var titleNode = doc.getElementsByTagName("title")[0];

        if (titleNode) {
            ret = true;
            this.page.title = titleNode.textContent;
            // XXXX See if we have a JSTOR PDF
            var node = doc.getElementById("pdf");
            if (!node) {
                // XXXX SSRN has these ...
                // XXXX ... but nevermind. Even attachments during during translation 
                // XXXX don't work on SSRN.
                //node = doc.getElementById("openDownloadLink1");
            }
            if (node) {
                var url = node.getAttribute("href");
                if (url.slice(0,1) === "/") {
                    var host = doc.location.host;
                    this.page.pdfURL = "http://" + host + url + "?acceptTC=true";
                } else if (!url.match(/^https?:\/\//)) {
                    var m = doc.documentURI.match(/(.*\/)/);
                    if (m) {
                        this.page.pdfURL = m[1] + url;
                    }
                }
            } else if (doc.getElementById("abstract")) {
                this.page.block = doc.getElementById("abstract");
            } else if (doc.getElementById("gs_opinion_wrapper")) {
                this.page.block = doc.getElementById("gs_opinion_wrapper");
            //} else if (doc.getElementsByClassName("story-body")[0]) {
            //    this.page.block = doc.getElementsByClassName("story-body")[0];
            } else {
                // XXXX See if we have paragraphs with headers
                this.page.parasList = Zotero.Utilities.xpath(doc, "//h1 | //h2 | //h3 | //p");
                // XXXX Or just multiple paragraphs that follow some sort of header
                this.page.rawParasList = Zotero.Utilities.xpath(doc, "//* [self::h1 or self::h2 or self::h3 or self::header or self::div[h1 or h2 or h3]]/following-sibling::div[p[2]]");
            }
        }
	}
    return ret;
}

ZoteroAttacher.Tab.prototype.attachDoc = function() {

	if (!ZoteroAttacher.progress) {
		ZoteroAttacher.progress = new Zotero.ProgressWindow();
    }

    var doc = this.page.doc;

    // XXXX Get seleected item, throw error message on failure.
    var item = this.page.item;
    

	ZoteroAttacher.progress.changeHeadline(Zotero.getString('ingester.scraping'));
	ZoteroAttacher.progress.addLines("ATTACH: " + this.page.title, ZoteroAttacher.statusImage.src)
	ZoteroAttacher.progress.show();

    try {
        if (this.page.pdfURL || this.page.parasList || this.page.block || this.page.rawParasList) {
            var attachments = this.page.item.getAttachments();
            for (var i=0,ilen=attachments.length;i<ilen;i+=1) {
                var attachmentID = attachments[i];
                var attachment = Zotero.Items.get(attachmentID);
                if ((attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE 
                     || attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_URL)
                    && !attachment.fileExists()) {
                    Zotero.Items.trash(attachmentID);
                }
            }
        }
        if (this.page.pdfURL) {
            Zotero.Attachments.importFromURL(this.page.pdfURL, item.id, false, false, false, "application/pdf");
        } else if (this.page.parasList || this.page.block || this.page.rawParasList) {
            var retset;
            if (this.page.block) {
                retset = this.page.block;
            } else {
                retset = [];
                // Get contiguous paras that look right
                tryset = [];
                for (var i=0,ilen=this.page.rawParasList.length;i<ilen;i+=1) {
                    var block = this.page.rawParasList[i];
                    tryset = block.getElementsByTagName("p");
                    if (tryset.length > retset.length) {
                        for (var j=0,jlen=tryset.length;j<jlen;j+=1) {
                            retset.push(tryset[j]);
                        }
                    }
                }
                if (retset.length === 0) {

                    // XXX Really require zero length? Maybe compare which gets more content?

                    // Get the longest contiguous run of paragraph nodes that is immediately
                    // preceded by at least one H1, H2 or H3 node, counting H1, H2 and H3 nodes
                    // as part of the run.
                    
                    var tryset = [];
                    var parent = null;

                    for (var i=0,ilen=this.page.parasList.length;i<ilen;i+=1) {
                        var block = this.page.parasList[i];
                        // Handle blocks under common parent as a group.
                        if (parent !== block.parentNode) {
                            var hasHead = false;
                            var hasPara = false;
                            for (var j=0,jlen=tryset.length;j<jlen;j+=1) {
                                if (["H1","H2","H3"].indexOf(tryset[j].tagName) > -1) {
                                    hasHead = true;
                                    if (tryset[j].tagName === "P") {
                                        hasPara = true;
                                    }
                                }
                            }
                            if (hasHead && hasPara) {
                                retset = tryset;
                                tryset = [block];
                            } else if (tryset.length > retset.length) {
                                tryset.push(block);
                            }
                            parent = block.parentNode;
                        } else {
                            tryset.push(block);
                        }
                    }
                    if (tryset.length > retset.length) {
                        retset = tryset;
                    }
                }
            }

            // head (title and css)
            var head = doc.createElement("head");
            var titlenode = doc.createElement("title");
            head.appendChild(titlenode)
            titlenode.appendChild(doc.createTextNode(this.page.title));
            
            var style = doc.createElement("style");
            head.appendChild(style)
            style.setAttribute("type", "text/css")
            var css = "*{margin:0;padding:0;}div.mlz-outer{width: 60em;margin:0 auto;text-align:left;}body{text-align:center;}p{margin-top:0.75em;margin-bottom:0.75em;}div.mlz-link-button a{text-decoration:none;background:#cccccc;color:white;border-radius:1em;font-family:sans;padding:0.2em 0.8em 0.2em 0.8em;}div.mlz-link-button a:hover{background:#bbbbbb;}div.mlz-link-button{margin: 0.7em 0 0.8em 0;}";
            style.appendChild(doc.createTextNode(css));
            var attachmentdoc = Zotero.Utilities.composeDoc(doc, head, retset);
            // Eliminate all the img tags
            var images = Zotero.Utilities.xpath(attachmentdoc, "//img");
            for (var i=images.length - 1;i>-1;i+=-1) {
                images[i].parentNode.removeChild(images[i]);
            }
            Zotero.Attachments.importFromDocument(attachmentdoc, item.id);
        }
    } catch (e) {
        dump("XXX OOPS: "+e+"\n");
    }

	ZoteroAttacher.progress.startCloseTimer(1500);

    ZoteroAttacher.updateStatus(true);
}

ZoteroAttacher.init();
