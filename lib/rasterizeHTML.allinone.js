(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.rasterizeHTML = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*! rasterizeHTML.js - v1.3.0 - 2018-08-01
* http://www.github.com/cburgmer/rasterizeHTML.js
* Copyright (c) 2018 Christoph Burgmer; Licensed MIT */
(function (root, factory) {
  if (root === undefined && window !== undefined) root = window;
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module unless amdModuleId is set
    define(["url","xmlserializer","sane-domparser-error","inlineresources"], function (a0,b1,c2,d3) {
      return (root['rasterizeHTML'] = factory(a0,b1,c2,d3));
    });
  } else if (typeof module === 'object' && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory(require("url"),require("xmlserializer"),require("sane-domparser-error"),require("inlineresources"));
  } else {
    root['rasterizeHTML'] = factory(root["url"],root["xmlserializer"],root["sanedomparsererror"],root["inlineresources"]);
  }
}(this, function (url, xmlserializer, sanedomparsererror, inlineresources) {

var util = (function (url) {
    "use strict";

    var module = {};

    var uniqueIdList = [];

    module.joinUrl = function (baseUrl, relUrl) {
        if (!baseUrl) {
            return relUrl;
        }
        return url.resolve(baseUrl, relUrl);
    };

    module.getConstantUniqueIdFor = function (element) {
        // HACK, using a list results in O(n), but how do we hash e.g. a DOM node?
        if (uniqueIdList.indexOf(element) < 0) {
            uniqueIdList.push(element);
        }
        return uniqueIdList.indexOf(element);
    };

    module.clone = function (object) {
        var theClone = {},
            i;
        for (i in object) {
            if (object.hasOwnProperty(i)) {
                theClone[i] = object[i];
            }
        }
        return theClone;
    };

    var isObject = function (obj) {
        return typeof obj === "object" && obj !== null;
    };

    var isCanvas = function (obj) {
        return isObject(obj) &&
            Object.prototype.toString.apply(obj).match(/\[object (Canvas|HTMLCanvasElement)\]/i);
    };

    // args: canvas, options
    module.parseOptionalParameters = function (args) {
        var parameters = {
            canvas: null,
            options: {}
        };

        if (args[0] == null || isCanvas(args[0])) {
            parameters.canvas = args[0] || null;

            parameters.options = module.clone(args[1]);
        } else {
            parameters.options = module.clone(args[0]);
        }

        return parameters;
    };

    return module;
}(url));

// Proxy objects by monkey patching
var proxies = (function (util) {
    "use strict";

    var module = {};

    var monkeyPatchInstanceMethod = function (object, methodName, proxyFunc) {
        var originalFunc = object[methodName];

        object[methodName] = function () {
            var args = Array.prototype.slice.call(arguments);

            return proxyFunc.apply(this, [args, originalFunc]);
        };

        return originalFunc;
    };

    // Bases all XHR calls on the given base URL
    module.baseUrlRespectingXhr = function (XHRObject, baseUrl) {
        var xhrConstructor = function () {
            var xhr = new XHRObject();

            monkeyPatchInstanceMethod(xhr, 'open', function (args, originalOpen) {
                var method = args.shift(),
                    url = args.shift(),
                    joinedUrl = util.joinUrl(baseUrl, url);

                return originalOpen.apply(this, [method, joinedUrl].concat(args));
            });

            return xhr;
        };

        return xhrConstructor;
    };

    // Provides a convenient way of being notified when all pending XHR calls are finished
    module.finishNotifyingXhr = function (XHRObject) {
        var totalXhrCount = 0,
            doneXhrCount = 0,
            waitingForPendingToClose = false;
        var checkAllRequestsFinished;

        var promise = new Promise(function (resolve) {
            checkAllRequestsFinished = function () {
                var pendingXhrCount = totalXhrCount - doneXhrCount;

                if (pendingXhrCount <= 0 && waitingForPendingToClose) {
                    resolve({totalCount: totalXhrCount});
                }
            };
        });

        var xhrConstructor = function () {
            var xhr = new XHRObject();

            monkeyPatchInstanceMethod(xhr, 'send', function (_, originalSend) {
                totalXhrCount += 1;
                return originalSend.apply(this, arguments);
            });

            xhr.addEventListener('load', function () {
                doneXhrCount += 1;

                checkAllRequestsFinished();
            });

            return xhr;
        };

        xhrConstructor.waitForRequestsToFinish = function () {
            waitingForPendingToClose = true;
            checkAllRequestsFinished();
            return promise;
        };

        return xhrConstructor;
    };

    return module;
}(util));

var documentUtil = (function () {
    "use strict";

    var module = {};

    var asArray = function (arrayLike) {
        return Array.prototype.slice.call(arrayLike);
    };

    module.addClassName = function (element, className) {
        element.className += ' ' + className;
    };

    module.addClassNameRecursively = function (element, className) {
        module.addClassName(element, className);

        if (element.parentNode !== element.ownerDocument) {
            module.addClassNameRecursively(element.parentNode, className);
        }
    };

    var changeCssRule = function (rule, newRuleText) {
        var styleSheet = rule.parentStyleSheet,
            ruleIdx = asArray(styleSheet.cssRules).indexOf(rule);

        // Exchange rule with the new text
        styleSheet.insertRule(newRuleText, ruleIdx+1);
        styleSheet.deleteRule(ruleIdx);
    };

    var updateRuleSelector = function (rule, updatedSelector) {
        var styleDefinitions = rule.cssText.replace(/^[^\{]+/, ''),
            newRule = updatedSelector + ' ' + styleDefinitions;

        changeCssRule(rule, newRule);
    };

    var cssRulesToText = function (cssRules) {
        return asArray(cssRules).reduce(function (cssText, rule) {
            return cssText + rule.cssText;
        }, '');
    };

    var rewriteStyleContent = function (styleElement) {
        styleElement.textContent = cssRulesToText(styleElement.sheet.cssRules);
    };

    var addSheetPropertyToSvgStyleElement = function (svgStyleElement) {
        var doc = document.implementation.createHTMLDocument(''),
            cssStyleElement = document.createElement('style');

        cssStyleElement.textContent = svgStyleElement.textContent;
        // the style will only be parsed once it is added to a document
        doc.body.appendChild(cssStyleElement);

        svgStyleElement.sheet = cssStyleElement.sheet;
    };

    var matchingSimpleSelectorsRegex = function (simpleSelectorList) {
        return '(' +
            '(?:^|[^.#:\\w])' +            // start of string or not a simple selector character,
            '|' +                          // ... or ...
            '(?=\\W)' +                    // the next character parsed is not an alphabetic character (and thus a natural boundary)
            ')' +
            '(' +
            simpleSelectorList.join('|') + // one out of the given simple selectors
            ')' +
            '(?=\\W|$)';                   // followed either by a non-alphabetic character or the end of the string
    };

    var replaceSimpleSelectorsBy = function (element, simpleSelectorList, caseInsensitiveReplaceFunc) {
        var selectorRegex = matchingSimpleSelectorsRegex(simpleSelectorList);

        asArray(element.querySelectorAll('style')).forEach(function (styleElement) {
            // SVGStyleElement doesn't have a property sheet in Safari, we need some workaround here
            // more details can be found here: https://github.com/cburgmer/rasterizeHTML.js/issues/158
            if (typeof styleElement.sheet === 'undefined') {
                addSheetPropertyToSvgStyleElement(styleElement);
            }

            var matchingRules = asArray(styleElement.sheet.cssRules).filter(function (rule) {
                return rule.selectorText && new RegExp(selectorRegex, 'i').test(rule.selectorText);
            });

            if (matchingRules.length) {
                matchingRules.forEach(function (rule) {
                    var newSelector = rule.selectorText.replace(new RegExp(selectorRegex, 'gi'),
                                                             function (_, prefixMatch, selectorMatch) {
                        return prefixMatch + caseInsensitiveReplaceFunc(selectorMatch);
                    });

                    if (newSelector !== rule.selectorText) {
                        updateRuleSelector(rule, newSelector);
                    }
                });

                rewriteStyleContent(styleElement);
            }
        });
    };

    module.rewriteCssSelectorWith = function (element, oldSelector, newSelector) {
        replaceSimpleSelectorsBy(element, [oldSelector], function () {
            return newSelector;
        });
    };

    module.lowercaseCssTypeSelectors = function (element, matchingTagNames) {
        replaceSimpleSelectorsBy(element, matchingTagNames, function (match) {
            return match.toLowerCase();
        });
    };

    module.findHtmlOnlyNodeNames = function (element) {
        var treeWalker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_ELEMENT),
            htmlNodeNames = {},
            nonHtmlNodeNames = {},
            currentTagName;

        do {
            currentTagName = treeWalker.currentNode.tagName.toLowerCase();
            if (treeWalker.currentNode.namespaceURI === 'http://www.w3.org/1999/xhtml') {
                htmlNodeNames[currentTagName] = true;
            } else {
                nonHtmlNodeNames[currentTagName] = true;
            }
        } while(treeWalker.nextNode());

        return Object.keys(htmlNodeNames).filter(function (tagName) {
            return !nonHtmlNodeNames[tagName];
        });
    };

    return module;
}());

var documentHelper = (function (documentUtil) {
    "use strict";

    var module = {};

    var asArray = function (arrayLike) {
        return Array.prototype.slice.call(arrayLike);
    };

    var cascadingAction = {
        active: true,
        hover: true,
        focus: false,
        target: false
    };

    module.fakeUserAction = function (element, selector, action) {
        var elem = element.querySelector(selector),
            pseudoClass = ':' + action,
            fakeActionClass = 'rasterizehtml' + action;
        if (! elem) {
            return;
        }

        if (cascadingAction[action]) {
            documentUtil.addClassNameRecursively(elem, fakeActionClass);
        } else {
            documentUtil.addClassName(elem, fakeActionClass);
        }
        documentUtil.rewriteCssSelectorWith(element, pseudoClass, '.' + fakeActionClass);
    };

    module.persistInputValues = function (doc) {
        var inputs = doc.querySelectorAll('input'),
            textareas = doc.querySelectorAll('textarea'),
            isCheckable = function (input) {
                return input.type === 'checkbox' || input.type === 'radio';
            };

        asArray(inputs).filter(isCheckable)
            .forEach(function (input) {
                if (input.checked) {
                    input.setAttribute('checked', '');
                } else {
                    input.removeAttribute('checked');
                }
            });

        asArray(inputs).filter(function (input) { return !isCheckable(input); })
            .forEach(function (input) {
                input.setAttribute('value', input.value);
            });

        asArray(textareas)
            .forEach(function (textarea) {
                textarea.textContent = textarea.value;
            });
    };

    module.rewriteTagNameSelectorsToLowerCase = function (element) {
        documentUtil.lowercaseCssTypeSelectors(element, documentUtil.findHtmlOnlyNodeNames(element));
    };

    return module;
}(documentUtil));

var browser = (function (util, proxies, sanedomparsererror, theWindow) {
    "use strict";

    var module = {};

    var createHiddenElement = function (doc, tagName, width, height) {
        var element = doc.createElement(tagName);
        // 'display: none' doesn't cut it, as browsers seem to be lazy loading CSS
        element.style.visibility = "hidden";
        element.style.width = width + "px";
        element.style.height = height + "px";
        element.style.position = "absolute";
        element.style.top = (-10000 - height) + "px";
        element.style.left = (-10000 - width) + "px";
        // We need to add the element to the document so that its content gets loaded
        doc.getElementsByTagName("body")[0].appendChild(element);
        return element;
    };

    var wait = function (timeout) {
        if (timeout > 0) {
            return new Promise(function (resolve) {
                setTimeout(resolve, timeout);
            });
        } else {
            return Promise.resolve();
        }
    };

    module.executeJavascript = function (element, options) {
        return new Promise(function (resolve) {
            var iframe = createHiddenElement(theWindow.document, "iframe", options.width, options.height),
                html = element.outerHTML,
                iframeErrorsMessages = [],
                executeJsTimeout = options.executeJsTimeout || 0;

            var doResolve = function () {
                var doc = iframe.contentDocument;
                theWindow.document.getElementsByTagName("body")[0].removeChild(iframe);
                resolve({
                    document: doc,
                    errors: iframeErrorsMessages
                });
            };

            var xhr = iframe.contentWindow.XMLHttpRequest,
                finishNotifyXhrProxy = proxies.finishNotifyingXhr(xhr),
                baseUrlXhrProxy = proxies.baseUrlRespectingXhr(finishNotifyXhrProxy, options.baseUrl);

            iframe.onload = function () {
                wait(executeJsTimeout)
                    .then(finishNotifyXhrProxy.waitForRequestsToFinish)
                    .then(doResolve);
            };

            iframe.contentDocument.open();
            iframe.contentWindow.XMLHttpRequest = baseUrlXhrProxy;
            iframe.contentWindow.onerror = function (msg) {
                iframeErrorsMessages.push({
                    resourceType: "scriptExecution",
                    msg: msg
                });
            };

            iframe.contentDocument.write('<!DOCTYPE html>');
            iframe.contentDocument.write(html);
            iframe.contentDocument.close();
        });
    };

    var createHiddenSandboxedIFrame = function (doc, width, height) {
        var iframe = doc.createElement('iframe');
        iframe.style.width = width + "px";
        iframe.style.height = height + "px";
        // 'display: none' doesn't cut it, as browsers seem to be lazy loading content
        iframe.style.visibility = "hidden";
        iframe.style.position = "absolute";
        iframe.style.top = (-10000 - height) + "px";
        iframe.style.left = (-10000 - width) + "px";
        // make sure content gets exact width independent of box-sizing value
        iframe.style.borderWidth = 0;
        // Don't execute JS, all we need from sandboxing is access to the iframe's document
        iframe.sandbox = 'allow-same-origin';
        // Don't include a scrollbar on Linux
        iframe.scrolling = 'no';
        return iframe;
    };

    var createIframeWithSizeAtZoomLevel1 = function (width, height, zoom) {
        var scaledViewportWidth = Math.floor(width / zoom),
            scaledViewportHeight = Math.floor(height / zoom);

        return createHiddenSandboxedIFrame(theWindow.document, scaledViewportWidth, scaledViewportHeight);
    };

    var calculateZoomedContentSizeAndRoundUp = function (actualViewport, requestedWidth, requestedHeight, zoom) {
        return {
            width: Math.max(actualViewport.width * zoom, requestedWidth),
            height: Math.max(actualViewport.height * zoom, requestedHeight)
        };
    };

    var selectElementOrDescendant = function (element, selector) {
        var descendant = element.querySelector(selector);
        if (descendant) {
            return descendant;
        } else if (element.ownerDocument.querySelector(selector) === element) {
            return element;
        }

        throw {
            message: "Clipping selector not found"
        };
    };

    var calculateContentSize = function (rootElement, selector, requestedWidth, requestedHeight, zoom) {
        // clientWidth/clientHeight needed for PhantomJS
        var actualViewportWidth = Math.max(rootElement.scrollWidth, rootElement.clientWidth),
            actualViewportHeight = Math.max(rootElement.scrollHeight, rootElement.clientHeight),
            top, left, originalWidth, originalHeight, rootFontSize,
            element, rect, contentSize;

        if (selector) {
            element = selectElementOrDescendant(rootElement, selector);

            rect = element.getBoundingClientRect();

            top = rect.top;
            left = rect.left;
            originalWidth = rect.width;
            originalHeight = rect.height;
        } else {
            top = 0;
            left = 0;
            originalWidth = actualViewportWidth;
            originalHeight = actualViewportHeight;
        }

        contentSize = calculateZoomedContentSizeAndRoundUp({
                width: originalWidth,
                height: originalHeight
            },
            requestedWidth,
            requestedHeight,
            zoom);

        rootFontSize = theWindow.getComputedStyle(rootElement.ownerDocument.documentElement).fontSize;

        return {
            left: left,
            top: top,
            width: contentSize.width,
            height: contentSize.height,
            viewportWidth: actualViewportWidth,
            viewportHeight: actualViewportHeight,

            rootFontSize: rootFontSize
        };
    };

    var findCorrelatingElement = function (element, documentClone) {
        var tagName = element.tagName;
        // Stupid but simple method: find first match. Should work for a single HTML element, and any other element given as root
        return documentClone.querySelector(tagName);
    };

    var elementToFullHtmlDocument = function (element) {
        var tagName = element.tagName.toLowerCase();
        if (tagName === 'html' || tagName === 'body') {
            return element.outerHTML;
        }

        // Simple hack: hide the body from sizing, otherwise browser would apply a 8px margin
        return '<body style="margin: 0;">' + element.outerHTML + '</body>';
    };

    module.calculateDocumentContentSize = function (element, options) {
        return new Promise(function (resolve, reject) {
            var zoom = options.zoom || 1,
                iframe;


            iframe = createIframeWithSizeAtZoomLevel1(options.width, options.height, zoom);
            // We need to add the element to the document so that its content gets loaded
            theWindow.document.getElementsByTagName("body")[0].appendChild(iframe);

            iframe.onload = function () {
                var doc = iframe.contentDocument,
                    size;

                try {
                    size = calculateContentSize(findCorrelatingElement(element, doc), options.clip, options.width, options.height, zoom);

                    resolve(size);
                } catch (e) {
                    reject(e);
                } finally {
                    theWindow.document.getElementsByTagName("body")[0].removeChild(iframe);
                }
            };

            // srcdoc doesn't work in PhantomJS yet
            iframe.contentDocument.open();
            iframe.contentDocument.write('<!DOCTYPE html>');
            iframe.contentDocument.write(elementToFullHtmlDocument(element));
            iframe.contentDocument.close();
        });
    };

    module.parseHtmlFragment = function (htmlFragment) {
        var doc = theWindow.document.implementation.createHTMLDocument('');
        doc.documentElement.innerHTML = htmlFragment;

        var element = doc.querySelector('body').firstChild;

        if (!element) {
            throw "Invalid source";
        }

        return element;
    };

    var addHTMLTagAttributes = function (doc, html) {
        var attributeMatch = /<html((?:\s+[^>]*)?)>/im.exec(html),
            helperDoc = theWindow.document.implementation.createHTMLDocument(''),
            htmlTagSubstitute,
            i, elementSubstitute, attribute;

        if (!attributeMatch) {
            return;
        }

        htmlTagSubstitute = '<div' + attributeMatch[1] + '></div>';
        helperDoc.documentElement.innerHTML = htmlTagSubstitute;
        elementSubstitute = helperDoc.querySelector('div');

        for (i = 0; i < elementSubstitute.attributes.length; i++) {
            attribute = elementSubstitute.attributes[i];
            doc.documentElement.setAttribute(attribute.name, attribute.value);
        }
    };

    module.parseHTML = function (html) {
        // We should be using the DOMParser, but it is not supported in older browsers
        var doc = theWindow.document.implementation.createHTMLDocument('');
        doc.documentElement.innerHTML = html;

        addHTMLTagAttributes(doc, html);
        return doc;
    };

    var failOnInvalidSource = function (doc) {
        try {
            return sanedomparsererror.failOnParseError(doc);
        } catch (e) {
            throw {
                message: "Invalid source",
                originalError: e
            };
        }
    };

    module.validateXHTML = function (xhtml) {
        var p = new DOMParser(),
            doc = p.parseFromString(xhtml, "application/xml");

        failOnInvalidSource(doc);
    };

    var lastCacheDate = null;

    var getUncachableURL = function (url, cache) {
        if (cache === 'none' || cache === 'repeated') {
            if (lastCacheDate === null || cache !== 'repeated') {
                lastCacheDate = Date.now();
            }
            return url + "?_=" + lastCacheDate;
        } else {
            return url;
        }
    };

    var doDocumentLoad = function (url, options) {
        return new Promise(function (resolve, reject) {
            var xhr = new window.XMLHttpRequest(),
                joinedUrl = util.joinUrl(options.baseUrl, url),
                augmentedUrl = getUncachableURL(joinedUrl, options.cache),
                doReject = function (e) {
                    reject({
                        message: "Unable to load page",
                        originalError: e
                    });
                };

            xhr.addEventListener("load", function () {
                if (xhr.status === 200 || xhr.status === 0) {
                    resolve(xhr.responseXML);
                } else {
                    doReject(xhr.statusText);
                }
            }, false);

            xhr.addEventListener("error", function (e) {
                doReject(e);
            }, false);

            try {
                xhr.open('GET', augmentedUrl, true);
                xhr.responseType = "document";
                xhr.send(null);
            } catch (e) {
                doReject(e);
            }
        });
    };

    module.loadDocument = function (url, options) {
        return doDocumentLoad(url, options)
            .then(function (doc) {
                return failOnInvalidSource(doc);
            });
    };

    return module;
}(util, proxies, sanedomparsererror, window));

var svg2image = (function (window) {
    "use strict";

    var module = {};

    var urlForSvg = function (svg, useBlobs) {
        if (useBlobs) {
            return URL.createObjectURL(new Blob([svg], {"type": "image/svg+xml"}));
        } else {
            return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
        }
    };

    var cleanUpUrl = function (url) {
        if (url instanceof Blob) {
            URL.revokeObjectURL(url);
        }
    };

    var simpleForeignObjectSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><foreignObject></foreignObject></svg>';

    var supportsReadingObjectFromCanvas = function (url) {
        return new Promise(function (resolve, reject) {
            var canvas = document.createElement("canvas"),
                image = new Image();

            image.onload = function () {
                var context = canvas.getContext("2d");
                try {
                    context.drawImage(image, 0, 0);
                    // This will fail in Chrome & Safari
                    canvas.toDataURL("image/png");
                    resolve(true);
                } catch (e) {
                    resolve(false);
                }
            };
            image.onerror = reject;
            image.src = url;
        });
    };

    var readingBackFromCanvasBenefitsFromOldSchoolDataUris = function () {
        // Check for work around for https://code.google.com/p/chromium/issues/detail?id=294129
        var blobUrl = urlForSvg(simpleForeignObjectSvg, true);
        return supportsReadingObjectFromCanvas(blobUrl)
            .then(function (supportsReadingFromBlobs) {
                cleanUpUrl(blobUrl);
                if (supportsReadingFromBlobs) {
                    return false;
                }
                return supportsReadingObjectFromCanvas(urlForSvg(simpleForeignObjectSvg, false))
                    .then(function (s) {
                        return s;
                    });
            }, function () {
                return false;
            });
    };

    var supportsBlobBuilding = function () {
        if (window.Blob) {
            // Available as constructor only in newer builds for all browsers
            try {
                new Blob(['<b></b>'], { "type" : "text/xml" });
                return true;
            } catch (err) {}
        }
        return false;
    };

    var checkBlobSupport = function () {
        return new Promise(function (resolve, reject) {
            if (supportsBlobBuilding() && window.URL) {
                readingBackFromCanvasBenefitsFromOldSchoolDataUris()
                    .then(function (doesBenefit) {
                        resolve(! doesBenefit);
                    }, function () {
                        reject();
                    });
            } else {
                resolve(false);
            }
        });
    };

    var checkForBlobsResult;

    var checkForBlobs = function () {
        if (checkForBlobsResult === undefined) {
            checkForBlobsResult = checkBlobSupport();
        }

        return checkForBlobsResult;
    };

    var buildImageUrl = function (svg) {
        return checkForBlobs().then(function (useBlobs) {
            return urlForSvg(svg, useBlobs);
        });
    };

    module.renderSvg = function (svg) {
        return new Promise(function (resolve, reject) {
            var url, image,
                resetEventHandlers = function () {
                    image.onload = null;
                    image.onerror = null;
                },
                cleanUp = function () {
                    if (url) {
                        cleanUpUrl(url);
                    }
                };

            image = new Image();
            image.onload = function() {
                resetEventHandlers();
                cleanUp();

                resolve(image);
            };
            image.onerror = function () {
                cleanUp();

                // Webkit calls the onerror handler if the SVG is faulty
                reject();
            };

            buildImageUrl(svg).then(function (imageUrl) {
                url = imageUrl;
                image.src = url;
            }, reject);
        });
    };

    return module;
}(window));

var document2svg = (function (util, browser, documentHelper, xmlserializer) {
    "use strict";

    var module = {};

    var svgAttributes = function (size, zoom) {
        var zoomFactor = zoom || 1;

        var attributes = {
            width: size.width,
            height: size.height,
            'font-size': size.rootFontSize
        };

        if (zoomFactor !== 1) {
            attributes.style = 'transform:scale(' + zoomFactor + '); transform-origin: 0 0;';
        }

        return attributes;
    };

    var foreignObjectAttributes = function (size) {
        var closestScaledWith, closestScaledHeight,
            offsetX, offsetY;

        closestScaledWith = Math.round(size.viewportWidth);
        closestScaledHeight = Math.round(size.viewportHeight);

        offsetX = -size.left;
        offsetY = -size.top;

        var attributes = {
             'x': offsetX,
             'y': offsetY,
             'width': closestScaledWith,
             'height': closestScaledHeight
        };

        return attributes;
    };

    var workAroundCollapsingMarginsAcrossSVGElementInWebKitLike = function (attributes) {
        var style = attributes.style || '';
        attributes.style = style + 'float: left;';
    };

    var workAroundSafariSometimesNotShowingExternalResources = function (attributes) {
        /* Let's hope that works some magic. The spec says SVGLoad only fires
         * now when all externals are available.
         * http://www.w3.org/TR/SVG/struct.html#ExternalResourcesRequired */
        attributes.externalResourcesRequired = true;
    };

    var workAroundChromeShowingScrollbarsUnderLinuxIfHtmlIsOverflowScroll = function () {
        return '<style scoped="">html::-webkit-scrollbar { display: none; }</style>';
    };

    var serializeAttributes = function (attributes) {
        var keys = Object.keys(attributes);
        if (!keys.length) {
            return '';
        }

        return ' ' + keys.map(function (key) {
            return key + '="' + attributes[key] + '"';
        }).join(' ');
    };

    var convertElementToSvg = function (element, size, zoomFactor) {
        var xhtml = xmlserializer.serializeToString(element);

        browser.validateXHTML(xhtml);

        var foreignObjectAttrs = foreignObjectAttributes(size);
        workAroundCollapsingMarginsAcrossSVGElementInWebKitLike(foreignObjectAttrs);
        workAroundSafariSometimesNotShowingExternalResources(foreignObjectAttrs);

        return (
            '<svg xmlns="http://www.w3.org/2000/svg"' +
                serializeAttributes(svgAttributes(size, zoomFactor)) +
                '>' +
                workAroundChromeShowingScrollbarsUnderLinuxIfHtmlIsOverflowScroll() +
                '<foreignObject' + serializeAttributes(foreignObjectAttrs) + '>' +
                xhtml +
                '</foreignObject>' +
                '</svg>'
        );
    };

    module.getSvgForDocument = function (element, size, zoomFactor) {
        documentHelper.rewriteTagNameSelectorsToLowerCase(element);

        return convertElementToSvg(element, size, zoomFactor);
    };

    module.drawDocumentAsSvg = function (element, options) {
        ['hover', 'active', 'focus', 'target'].forEach(function (action) {
            if (options[action]) {
                documentHelper.fakeUserAction(element, options[action], action);
            }
        });

        return browser.calculateDocumentContentSize(element, options)
            .then(function (size) {
                return module.getSvgForDocument(element, size, options.zoom);
            });
    };

    return module;
}(util, browser, documentHelper, xmlserializer));

var rasterize = (function (util, browser, documentHelper, document2svg, svg2image, inlineresources) {
    "use strict";

    var module = {};

    var generalDrawError = function (e) {
        return {
            message: "Error rendering page",
            originalError: e
        };
    };

    var drawSvgAsImg = function (svg) {
        return svg2image.renderSvg(svg)
            .then(function (image) {
                return {
                    image: image,
                    svg: svg
                };
            }, function (e) {
                throw generalDrawError(e);
            });
    };

    var drawImageOnCanvas = function (image, canvas) {
        try {
            canvas.getContext("2d").drawImage(image, 0, 0);
        } catch (e) {
            // Firefox throws a 'NS_ERROR_NOT_AVAILABLE' if the SVG is faulty
            throw generalDrawError(e);
        }
    };

    var doDraw = function (element, canvas, options) {
        return document2svg.drawDocumentAsSvg(element, options)
            .then(drawSvgAsImg)
            .then(function (result) {
                if (canvas) {
                    drawImageOnCanvas(result.image, canvas);
                }

                return result;
            });
    };

    var operateJavaScriptOnDocument = function (element, options) {
        return browser.executeJavascript(element, options)
            .then(function (result) {
                var document = result.document;
                documentHelper.persistInputValues(document);

                return {
                    document: document,
                    errors: result.errors
                };
            });
    };

    module.rasterize = function (element, canvas, options) {
        var inlineOptions;

        inlineOptions = util.clone(options);
        inlineOptions.inlineScripts = options.executeJs === true;

        return inlineresources.inlineReferences(element, inlineOptions)
            .then(function (errors) {
                if (options.executeJs) {
                    return operateJavaScriptOnDocument(element, options)
                        .then(function (result) {
                            return {
                                element: result.document.documentElement,
                                errors: errors.concat(result.errors)
                            };
                        });
                } else {
                    return {
                        element: element,
                        errors: errors
                    };
                }
            }).then(function (result) {
                return doDraw(result.element, canvas, options)
                    .then(function (drawResult) {
                        return {
                            image: drawResult.image,
                            svg: drawResult.svg,
                            errors: result.errors
                        };
                    });
            });
    };

    return module;
}(util, browser, documentHelper, document2svg, svg2image, inlineresources));

var rasterizeHTML = (function (util, browser, rasterize) {
    "use strict";

    var module = {};

    var getViewportSize = function (canvas, options) {
        var defaultWidth = 300,
            defaultHeight = 200,
            fallbackWidth = canvas ? canvas.width : defaultWidth,
            fallbackHeight = canvas ? canvas.height : defaultHeight,
            width = options.width !== undefined ? options.width : fallbackWidth,
            height = options.height !== undefined ? options.height : fallbackHeight;

        return {
            width: width,
            height: height
        };
    };

    var constructOptions = function (params) {
        var viewport = getViewportSize(params.canvas, params.options),
            options;

        options = util.clone(params.options);
        options.width = viewport.width;
        options.height = viewport.height;

        return options;
    };

    /**
     * Draws a Document to the canvas.
     * rasterizeHTML.drawDocument( document [, canvas] [, options] ).then(function (result) { ... });
     */
    module.drawDocument = function () {
        var doc = arguments[0],
            optionalArguments = Array.prototype.slice.call(arguments, 1),
            params = util.parseOptionalParameters(optionalArguments);

        var element = doc.documentElement ? doc.documentElement : doc;

        return rasterize.rasterize(element, params.canvas, constructOptions(params));
    };

    var drawHTML = function (html, canvas, options) {
        var doc = browser.parseHTML(html);

        return module.drawDocument(doc, canvas, options);
    };

    /**
     * Draws a HTML string to the canvas.
     * rasterizeHTML.drawHTML( html [, canvas] [, options] ).then(function (result) { ... });
     */
    module.drawHTML = function () {
        var html = arguments[0],
            optionalArguments = Array.prototype.slice.call(arguments, 1),
            params = util.parseOptionalParameters(optionalArguments);

        return drawHTML(html, params.canvas, params.options);
    };

    // work around https://bugzilla.mozilla.org/show_bug.cgi?id=925493
    var workAroundFirefoxNotLoadingStylesheetStyles = function (doc, url, options) {
        var d = document.implementation.createHTMLDocument('');
        d.replaceChild(doc.documentElement, d.documentElement);

        var extendedOptions = options ? util.clone(options) : {};

        if (!options.baseUrl) {
            extendedOptions.baseUrl = url;
        }

        return {
            document: d,
            options: extendedOptions
        };
    };

    var drawURL = function (url, canvas, options) {
        return browser.loadDocument(url, options)
            .then(function (doc) {
                var workaround = workAroundFirefoxNotLoadingStylesheetStyles(doc, url, options);
                return module.drawDocument(workaround.document, canvas, workaround.options);
            });
    };

    /**
     * Draws a page to the canvas.
     * rasterizeHTML.drawURL( url [, canvas] [, options] ).then(function (result) { ... });
     */
    module.drawURL = function () {
        var url = arguments[0],
            optionalArguments = Array.prototype.slice.call(arguments, 1),
            params = util.parseOptionalParameters(optionalArguments);

        return drawURL(url, params.canvas, params.options);
    };

    return module;
}(util, browser, rasterize));

return rasterizeHTML;

}));

},{"inlineresources":5,"sane-domparser-error":14,"url":15,"xmlserializer":17}],2:[function(require,module,exports){
(function (global){
(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.cssFontFaceSrc = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
/*
 * Generated by PEG.js 0.10.0.
 *
 * http://pegjs.org/
 */

"use strict";

function peg$subclass(child, parent) {
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message  = message;
  this.expected = expected;
  this.found    = found;
  this.location = location;
  this.name     = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return "\"" + literalEscape(expectation.text) + "\"";
        },

        "class": function(expectation) {
          var escapedParts = "",
              i;

          for (i = 0; i < expectation.parts.length; i++) {
            escapedParts += expectation.parts[i] instanceof Array
              ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1])
              : classEscape(expectation.parts[i]);
          }

          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },

        any: function(expectation) {
          return "any character";
        },

        end: function(expectation) {
          return "end of input";
        },

        other: function(expectation) {
          return expectation.description;
        }
      };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/-/g,  '\\-')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i, j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},

      peg$startRuleFunctions = { start: peg$parsestart },
      peg$startRuleFunction  = peg$parsestart,

      peg$c0 = "",
      peg$c1 = function() { return [] },
      peg$c2 = ",",
      peg$c3 = peg$literalExpectation(",", false),
      peg$c4 = function(x, xs) { return [x].concat(xs); },
      peg$c5 = function(entry) { return [entry]; },
      peg$c6 = function(url, format) { return {url: url, format: format}; },
      peg$c7 = function(url) { return {url: url}; },
      peg$c8 = "url(",
      peg$c9 = peg$literalExpectation("url(", false),
      peg$c10 = ")",
      peg$c11 = peg$literalExpectation(")", false),
      peg$c12 = function(value) { return value; },
      peg$c13 = "format(",
      peg$c14 = peg$literalExpectation("format(", false),
      peg$c15 = "local(",
      peg$c16 = peg$literalExpectation("local(", false),
      peg$c17 = function(value) { return {local: value}; },
      peg$c18 = /^[^)]/,
      peg$c19 = peg$classExpectation([")"], true, false),
      peg$c20 = function(chars) { return util.extractValue(chars.join("")); },
      peg$c21 = /^[ \t\r\n\f]/,
      peg$c22 = peg$classExpectation([" ", "\t", "\r", "\n", "\f"], false, false),

      peg$currPos          = 0,
      peg$savedPos         = 0,
      peg$posDetailsCache  = [{ line: 1, column: 1 }],
      peg$maxFailPos       = 0,
      peg$maxFailExpected  = [],
      peg$silentFails      = 0,

      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos], p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line:   details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails   = peg$computePosDetails(endPos);

    return {
      start: {
        offset: startPos,
        line:   startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line:   endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parsestart() {
    var s0, s1;

    s0 = peg$parsesourceEntries();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$c0;
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c1();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parsesourceEntries() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    s1 = peg$parsesourceEntry();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsewhitespace();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsewhitespace();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 44) {
          s3 = peg$c2;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c3); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parsewhitespace();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parsewhitespace();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parsesourceEntries();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c4(s1, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsesourceEntry();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c5(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parsesourceEntry() {
    var s0;

    s0 = peg$parseurlEntry();
    if (s0 === peg$FAILED) {
      s0 = peg$parselocalEntry();
    }

    return s0;
  }

  function peg$parseurlEntry() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseurl();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsewhitespace();
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsewhitespace();
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseformat();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c6(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseurl();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c7(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseurl() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4) === peg$c8) {
      s1 = peg$c8;
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c9); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsevalue();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 41) {
          s3 = peg$c10;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c11); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c12(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseformat() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7) === peg$c13) {
      s1 = peg$c13;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c14); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsevalue();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 41) {
          s3 = peg$c10;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c11); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c12(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parselocalEntry() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6) === peg$c15) {
      s1 = peg$c15;
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c16); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsevalue();
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 41) {
          s3 = peg$c10;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c11); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c17(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsevalue() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c18.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c19); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c18.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c19); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c20(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parsewhitespace() {
    var s0;

    if (peg$c21.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c22); }
    }

    return s0;
  }


    var util = _dereq_('../util');


  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

module.exports = {
  SyntaxError: peg$SyntaxError,
  parse:       peg$parse
};

},{"../util":3}],2:[function(_dereq_,module,exports){
var grammar = _dereq_('./grammar');


exports.SyntaxError = function (message, offset) {
    this.message  = message;
    this.offset   = offset;
};

exports.parse = function (fontFaceSourceValue) {
    try {
        return grammar.parse(fontFaceSourceValue);
    } catch (e) {
        throw new exports.SyntaxError(e.message, e.offset);
    }
};

exports.serialize = function (parsedFontFaceSources) {
    return parsedFontFaceSources.map(function (sourceItem) {
        var itemValue;

        if (sourceItem.url) {
            itemValue = 'url("' + sourceItem.url + '")';
            if (sourceItem.format) {
                itemValue += ' format("' + sourceItem.format + '")';
            }
        } else {
            itemValue = 'local("' + sourceItem.local + '")';
        }
        return itemValue;
    }).join(', ');
};

},{"./grammar":1}],3:[function(_dereq_,module,exports){
var trimCSSWhitespace = function (value) {
    var whitespaceRegex = /^[\t\r\f\n ]*(.+?)[\t\r\f\n ]*$/;

    return value.replace(whitespaceRegex, "$1");
};

var unquoteString = function (quotedUrl) {
    var doubleQuoteRegex = /^"(.*)"$/,
        singleQuoteRegex = /^'(.*)'$/;

    if (doubleQuoteRegex.test(quotedUrl)) {
        return quotedUrl.replace(doubleQuoteRegex, "$1");
    } else {
        if (singleQuoteRegex.test(quotedUrl)) {
            return quotedUrl.replace(singleQuoteRegex, "$1");
        } else {
            return quotedUrl;
        }
    }
};

exports.extractValue = function (value) {
    return unquoteString(trimCSSWhitespace(value));
};

},{}]},{},[2])(2)
});
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
// Simple, stupid "background"/"background-image" value parser that just aims at exposing the image URLs
"use strict";

var cssSupport = require('./cssSupport');


var trimCSSWhitespace = function (url) {
    var whitespaceRegex = /^[\t\r\f\n ]*(.+?)[\t\r\f\n ]*$/;

    return url.replace(whitespaceRegex, "$1");
};

// TODO exporting this for the sake of unit testing. Should rather test the background value parser explicitly.
exports.extractCssUrl = function (cssUrl) {
    var urlRegex = /^url\(("[^"]+"|'[^']+'|[^\)]+)\)/,
        quotedUrl;

    if (!urlRegex.test(cssUrl)) {
        throw new Error("Invalid url");
    }

    quotedUrl = urlRegex.exec(cssUrl)[1];
    return cssSupport.unquoteString(trimCSSWhitespace(quotedUrl));
};

var sliceBackgroundDeclaration = function (backgroundDeclarationText) {
    var functionParamRegexS = "\\s*(?:\"[^\"]*\"|'[^']*'|[^\\(]+)\\s*",
        valueRegexS = "(" + "url\\(" + functionParamRegexS + "\\)" + "|" + "[^,\\s]+" + ")",
        simpleSingularBackgroundRegexS = "(?:\\s*" + valueRegexS + ")+",
        simpleBackgroundRegexS = "^\\s*(" + simpleSingularBackgroundRegexS + ")" +
                                  "(?:\\s*,\\s*(" + simpleSingularBackgroundRegexS + "))*" +
                                  "\\s*$",
        simpleSingularBackgroundRegex = new RegExp(simpleSingularBackgroundRegexS, "g"),
        outerRepeatedMatch,
        backgroundLayers = [],
        getValues = function (singularBackgroundDeclaration) {
            var valueRegex = new RegExp(valueRegexS, "g"),
                backgroundValues = [],
                repeatedMatch;

            repeatedMatch = valueRegex.exec(singularBackgroundDeclaration);
            while (repeatedMatch) {
                backgroundValues.push(repeatedMatch[1]);
                repeatedMatch = valueRegex.exec(singularBackgroundDeclaration);
            }
            return backgroundValues;
        };

    if (backgroundDeclarationText.match(new RegExp(simpleBackgroundRegexS))) {
        outerRepeatedMatch = simpleSingularBackgroundRegex.exec(backgroundDeclarationText);
        while (outerRepeatedMatch) {
            backgroundLayers.push(getValues(outerRepeatedMatch[0]));
            outerRepeatedMatch = simpleSingularBackgroundRegex.exec(backgroundDeclarationText);
        }

        return backgroundLayers;
    }
    return [];
};

var findBackgroundImageUrlInValues = function (values) {
    var i, url;

    for(i = 0; i < values.length; i++) {
        try {
            url = exports.extractCssUrl(values[i]);
            return {
                url: url,
                idx: i
            };
        } catch (e) {}
    }
};

exports.parse = function (backgroundValue) {
    var backgroundLayers = sliceBackgroundDeclaration(backgroundValue);

    return backgroundLayers.map(function (backgroundLayerValues) {
        var urlMatch = findBackgroundImageUrlInValues(backgroundLayerValues);

        if (urlMatch) {
            return {
                preUrl: backgroundLayerValues.slice(0, urlMatch.idx),
                url: urlMatch.url,
                postUrl: backgroundLayerValues.slice(urlMatch.idx+1),
            };
        } else {
            return {
                preUrl: backgroundLayerValues
            };
        }
    });
};

exports.serialize = function (parsedBackground) {
    var backgroundLayers = parsedBackground.map(function (backgroundLayer) {
        var values = [].concat(backgroundLayer.preUrl);

        if (backgroundLayer.url) {
            values.push('url("' + backgroundLayer.url + '")');
        }
        if (backgroundLayer.postUrl) {
            values = values.concat(backgroundLayer.postUrl);
        }

        return values.join(' ');
    });

    return backgroundLayers.join(', ');
};

},{"./cssSupport":4}],4:[function(require,module,exports){
"use strict";

exports.unquoteString = function (quotedUrl) {
    var doubleQuoteRegex = /^"(.*)"$/,
        singleQuoteRegex = /^'(.*)'$/;

    if (doubleQuoteRegex.test(quotedUrl)) {
        return quotedUrl.replace(doubleQuoteRegex, "$1");
    } else {
        if (singleQuoteRegex.test(quotedUrl)) {
            return quotedUrl.replace(singleQuoteRegex, "$1");
        } else {
            return quotedUrl;
        }
    }
};

exports.rulesForCssText = function (styleContent) {
    var doc = document.implementation.createHTMLDocument(""),
        styleElement = document.createElement("style"),
        rules;

    styleElement.textContent = styleContent;
    // the style will only be parsed once it is added to a document
    doc.body.appendChild(styleElement);
    rules = styleElement.sheet.cssRules;

    return Array.prototype.slice.call(rules);
};

exports.cssRulesToText = function (cssRules) {
    return cssRules.reduce(function (cssText, rule) {
        return cssText + rule.cssText;
    }, '');
};

exports.exchangeRule = function (cssRules, rule, newRuleText) {
    var ruleIdx = cssRules.indexOf(rule);

    // We create a new document and stylesheet to parse the rule,
    // instead of relying on rule.parentStyleSheet, because
    // rule.parentStyleSheet may be null
    // (https://github.com/cburgmer/inlineresources/issues/3)
    cssRules[ruleIdx] = exports.rulesForCssText(newRuleText)[0];
};

// Workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=443978
exports.changeFontFaceRuleSrc = function (cssRules, rule, newSrc) {
    var newRuleText = '@font-face { font-family: ' + rule.style.getPropertyValue("font-family") + '; ';

    if (rule.style.getPropertyValue("font-style")) {
        newRuleText += 'font-style: ' + rule.style.getPropertyValue("font-style") + '; ';
    }

    if (rule.style.getPropertyValue("font-weight")) {
        newRuleText += 'font-weight: ' + rule.style.getPropertyValue("font-weight") + '; ';
    }

    newRuleText += 'src: ' + newSrc + '}';
    exports.exchangeRule(cssRules, rule, newRuleText);
};

},{}],5:[function(require,module,exports){
"use strict";

var util = require('./util'),
    inlineImage = require('./inlineImage'),
    inlineScript = require('./inlineScript'),
    inlineCss = require('./inlineCss'),
    cssSupport = require('./cssSupport');


var getUrlBasePath = function (url) {
    return util.joinUrl(url, '.');
};

var parameterHashFunction = function (params) {
    // HACK JSON.stringify is poor man's hashing;
    // same objects might not receive same result as key order is not guaranteed
    var a = params.map(function (param, idx) {
        // Only include options relevant for method
        if (idx === (params.length - 1)) {
            param = {
                // Two different HTML pages on the same path level have the same base path, but a different URL
                baseUrl: getUrlBasePath(param.baseUrl)
            };
        }
        return JSON.stringify(param);
    });
    return a;
};

var memoizeFunctionOnCaching = function (func, options) {
    if ((options.cache !== false && options.cache !== 'none') && options.cacheBucket) {
        return util.memoize(func, parameterHashFunction, options.cacheBucket);
    } else {
        return func;
    }
};

/* Style inlining */

var requestExternalsForStylesheet = function (styleContent, alreadyLoadedCssUrls, options) {
    var cssRules = cssSupport.rulesForCssText(styleContent);

    return inlineCss.loadCSSImportsForRules(cssRules, alreadyLoadedCssUrls, options).then(function (cssImportResult) {
        return inlineCss.loadAndInlineCSSResourcesForRules(cssRules, options).then(function (cssResourcesResult) {
            var errors = cssImportResult.errors.concat(cssResourcesResult.errors),
                hasChanges = cssImportResult.hasChanges || cssResourcesResult.hasChanges;

            if (hasChanges) {
                styleContent = cssSupport.cssRulesToText(cssRules);
            }

            return {
                hasChanges: hasChanges,
                content: styleContent,
                errors: errors
            };
        });
    });
};

var loadAndInlineCssForStyle = function (style, options, alreadyLoadedCssUrls) {
    var styleContent = style.textContent,
        processExternals = memoizeFunctionOnCaching(requestExternalsForStylesheet, options);

    return processExternals(styleContent, alreadyLoadedCssUrls, options).then(function (result) {
        if (result.hasChanges) {
            style.childNodes[0].nodeValue = result.content;
        }

        return util.cloneArray(result.errors);
    });
};

var getCssStyleElements = function (doc) {
    var styles = doc.getElementsByTagName("style");

    return Array.prototype.filter.call(styles, function (style) {
        return !style.attributes.type || style.attributes.type.value === "text/css";
    });
};

exports.loadAndInlineStyles = function (doc, options) {
    var styles = getCssStyleElements(doc),
        allErrors = [],
        alreadyLoadedCssUrls = [],
        inlineOptions;

    inlineOptions = util.clone(options);
    inlineOptions.baseUrl = inlineOptions.baseUrl || util.getDocumentBaseUrl(doc);

    return Promise.all(styles.map(function (style) {
        return loadAndInlineCssForStyle(style, inlineOptions, alreadyLoadedCssUrls).then(function (errors) {
            allErrors = allErrors.concat(errors);
        });
    })).then(function () {
        return allErrors;
    });
};

/* CSS link inlining */

var substituteLinkWithInlineStyle = function (oldLinkNode, styleContent) {
    var parent = oldLinkNode.parentNode,
        styleNode;

    styleContent = styleContent.trim();
    if (styleContent) {
        styleNode = oldLinkNode.ownerDocument.createElement("style");
        styleNode.type = "text/css";
        styleNode.appendChild(oldLinkNode.ownerDocument.createTextNode(styleContent));

        parent.insertBefore(styleNode, oldLinkNode);
    }

    parent.removeChild(oldLinkNode);
};

var requestStylesheetAndInlineResources = function (url, options) {
    return util.ajax(url, options)
        .then(function (content) {
            var cssRules = cssSupport.rulesForCssText(content);

            return {
                content: content,
                cssRules: cssRules
            };
        })
        .then(function (result) {
            var hasChangesFromPathAdjustment = inlineCss.adjustPathsOfCssResources(url, result.cssRules);

            return {
                content: result.content,
                cssRules: result.cssRules,
                hasChanges: hasChangesFromPathAdjustment
            };
        })
        .then(function (result) {
            return inlineCss.loadCSSImportsForRules(result.cssRules, [], options)
                .then(function (cssImportResult) {
                    return {
                        content: result.content,
                        cssRules: result.cssRules,
                        hasChanges: result.hasChanges || cssImportResult.hasChanges,
                        errors: cssImportResult.errors
                    };
                });
        })
        .then(function (result) {
            return inlineCss.loadAndInlineCSSResourcesForRules(result.cssRules, options)
                .then(function (cssResourcesResult) {
                    return {
                        content: result.content,
                        cssRules: result.cssRules,
                        hasChanges: result.hasChanges || cssResourcesResult.hasChanges,
                        errors: result.errors.concat(cssResourcesResult.errors)
                    };
                });
        })
        .then(function (result) {
            var content = result.content;
            if (result.hasChanges) {
                content = cssSupport.cssRulesToText(result.cssRules);
            }
            return {
                content: content,
                errors: result.errors
            };
        });
};

var loadLinkedCSS = function (link, options) {
    var cssHref = link.attributes.href.value,
        documentBaseUrl = util.getDocumentBaseUrl(link.ownerDocument),
        ajaxOptions = util.clone(options);

    if (!ajaxOptions.baseUrl && documentBaseUrl) {
        ajaxOptions.baseUrl = documentBaseUrl;
    }

    var processStylesheet = memoizeFunctionOnCaching(requestStylesheetAndInlineResources, options);

    return processStylesheet(cssHref, ajaxOptions).then(function (result) {
        return {
            content: result.content,
            errors: util.cloneArray(result.errors)
        };
    });
};

var getCssStylesheetLinks = function (doc) {
    var links = doc.getElementsByTagName("link");

    return Array.prototype.filter.call(links, function (link) {
        return link.attributes.rel && link.attributes.rel.value === "stylesheet" &&
            (!link.attributes.type || link.attributes.type.value === "text/css");
    });
};

exports.loadAndInlineCssLinks = function (doc, options) {
    var links = getCssStylesheetLinks(doc),
        errors = [];

    return Promise.all(links.map(function (link) {
        return loadLinkedCSS(link, options).then(function(result) {
            substituteLinkWithInlineStyle(link, result.content + "\n");

            errors = errors.concat(result.errors);
        }, function (e) {
            errors.push({
                resourceType: "stylesheet",
                url: e.url,
                msg: "Unable to load stylesheet " + e.url
            });
        });
    })).then(function () {
        return errors;
    });
};

/* Main */

exports.loadAndInlineImages = inlineImage.inline;
exports.loadAndInlineScript = inlineScript.inline;

exports.inlineReferences = function (doc, options) {
    var allErrors = [],
        inlineFuncs = [
            exports.loadAndInlineImages,
            exports.loadAndInlineStyles,
            exports.loadAndInlineCssLinks];

    if (options.inlineScripts !== false) {
        inlineFuncs.push(exports.loadAndInlineScript);
    }

    return Promise.all(inlineFuncs.map(function (func) {
        return func(doc, options)
            .then(function (errors) {
                allErrors = allErrors.concat(errors);
            });
    })).then(function () {
        return allErrors;
    });
};

},{"./cssSupport":4,"./inlineCss":6,"./inlineImage":7,"./inlineScript":8,"./util":9}],6:[function(require,module,exports){
"use strict";

var util = require('./util'),
    cssSupport = require('./cssSupport'),
    backgroundValueParser = require('./backgroundValueParser'),
    fontFaceSrcValueParser = require('css-font-face-src');


var updateCssPropertyValue = function (rule, property, value) {
    rule.style.setProperty(property, value, rule.style.getPropertyPriority(property));
};

var findBackgroundImageRules = function (cssRules) {
    return cssRules.filter(function (rule) {
        return rule.type === window.CSSRule.STYLE_RULE && (rule.style.getPropertyValue('background-image') || rule.style.getPropertyValue('background'));
    });
};

var findBackgroundDeclarations = function (rules) {
    var backgroundDeclarations = [];

    rules.forEach(function (rule) {
        if (rule.style.getPropertyValue('background-image')) {
            backgroundDeclarations.push({
                property: 'background-image',
                value: rule.style.getPropertyValue('background-image'),
                rule: rule
            });
        } else if (rule.style.getPropertyValue('background')) {
            backgroundDeclarations.push({
                property: 'background',
                value: rule.style.getPropertyValue('background'),
                rule: rule
            });
        }
    });

    return backgroundDeclarations;
};

var findFontFaceRules = function (cssRules) {
    return cssRules.filter(function (rule) {
        return rule.type === window.CSSRule.FONT_FACE_RULE && rule.style.getPropertyValue("src");
    });
};

var findCSSImportRules = function (cssRules) {
    return cssRules.filter(function (rule) {
        return rule.type === window.CSSRule.IMPORT_RULE && rule.href;
    });
};

var findExternalBackgroundUrls = function (parsedBackground) {
    var matchIndices = [];

    parsedBackground.forEach(function (backgroundLayer, i) {
        if (backgroundLayer.url && !util.isDataUri(backgroundLayer.url)) {
            matchIndices.push(i);
        }
    });

    return matchIndices;
};

var findExternalFontFaceUrls = function (parsedFontFaceSources) {
    var sourceIndices = [];
    parsedFontFaceSources.forEach(function (sourceItem, i) {
        if (sourceItem.url && !util.isDataUri(sourceItem.url)) {
            sourceIndices.push(i);
        }
    });
    return sourceIndices;
};

exports.adjustPathsOfCssResources = function (baseUrl, cssRules) {
    var backgroundRules = findBackgroundImageRules(cssRules),
        backgroundDeclarations = findBackgroundDeclarations(backgroundRules),
        change = false;

    backgroundDeclarations.forEach(function (declaration) {
        var parsedBackground = backgroundValueParser.parse(declaration.value),
            externalBackgroundIndices = findExternalBackgroundUrls(parsedBackground),
            backgroundValue;

        if (externalBackgroundIndices.length > 0) {
            externalBackgroundIndices.forEach(function (backgroundLayerIndex) {
                var relativeUrl = parsedBackground[backgroundLayerIndex].url,
                    url = util.joinUrl(baseUrl, relativeUrl);
                parsedBackground[backgroundLayerIndex].url = url;
            });

            backgroundValue = backgroundValueParser.serialize(parsedBackground);

            updateCssPropertyValue(declaration.rule, declaration.property, backgroundValue);

            change = true;
        }
    });
    findFontFaceRules(cssRules).forEach(function (rule) {
        var fontFaceSrcDeclaration = rule.style.getPropertyValue("src"),
            parsedFontFaceSources, externalFontFaceUrlIndices;

        try {
            parsedFontFaceSources = fontFaceSrcValueParser.parse(fontFaceSrcDeclaration);
        } catch (e) {
            return;
        }
        externalFontFaceUrlIndices = findExternalFontFaceUrls(parsedFontFaceSources);

        if (externalFontFaceUrlIndices.length > 0) {
            externalFontFaceUrlIndices.forEach(function (fontFaceUrlIndex) {
                var relativeUrl = parsedFontFaceSources[fontFaceUrlIndex].url,
                    url = util.joinUrl(baseUrl, relativeUrl);

                parsedFontFaceSources[fontFaceUrlIndex].url = url;
            });

            cssSupport.changeFontFaceRuleSrc(cssRules, rule, fontFaceSrcValueParser.serialize(parsedFontFaceSources));

            change = true;
        }
    });
    findCSSImportRules(cssRules).forEach(function (rule) {
        var cssUrl = rule.href,
            url = util.joinUrl(baseUrl, cssUrl);

        cssSupport.exchangeRule(cssRules, rule, "@import url(" + url + ");");

        change = true;
    });

    return change;
};

/* CSS import inlining */

var substituteRule = function (cssRules, rule, newCssRules) {
    var position = cssRules.indexOf(rule);

    cssRules.splice(position, 1);

    newCssRules.forEach(function (newRule, i) {
        cssRules.splice(position + i, 0, newRule);
    });
};

var loadAndInlineCSSImport = function (cssRules, rule, alreadyLoadedCssUrls, options) {
    var url = rule.href,
        cssHrefRelativeToDoc;

    url = cssSupport.unquoteString(url);

    cssHrefRelativeToDoc = util.joinUrl(options.baseUrl, url);

    if (alreadyLoadedCssUrls.indexOf(cssHrefRelativeToDoc) >= 0) {
        // Remove URL by adding empty string
        substituteRule(cssRules, rule, []);
        return Promise.resolve([]);
    } else {
        alreadyLoadedCssUrls.push(cssHrefRelativeToDoc);
    }

    return util.ajax(url, options)
        .then(function (cssText) {
            var externalCssRules = cssSupport.rulesForCssText(cssText);

            // Recursively follow @import statements
            return exports.loadCSSImportsForRules(externalCssRules, alreadyLoadedCssUrls, options)
                .then(function (result) {
                    exports.adjustPathsOfCssResources(url, externalCssRules);

                    substituteRule(cssRules, rule, externalCssRules);

                    return result.errors;
                });
        }, function (e) {
            throw {
                resourceType: "stylesheet",
                url: e.url,
                msg: "Unable to load stylesheet " + e.url
            };
        });
};

exports.loadCSSImportsForRules = function (cssRules, alreadyLoadedCssUrls, options) {
    var rulesToInline = findCSSImportRules(cssRules),
        errors = [],
        hasChanges = false;

    return Promise.all(rulesToInline.map(function (rule) {
        return loadAndInlineCSSImport(cssRules, rule, alreadyLoadedCssUrls, options).then(function (moreErrors) {
            errors = errors.concat(moreErrors);

            hasChanges = true;
        }, function (e) {
            errors.push(e);
        });
    })).then(function () {
        return {
            hasChanges: hasChanges,
            errors: errors
        };
    });
};

/* CSS linked resource inlining */

var loadAndInlineBackgroundImages = function (backgroundValue, options) {
    var parsedBackground = backgroundValueParser.parse(backgroundValue),
        externalBackgroundLayerIndices = findExternalBackgroundUrls(parsedBackground),
        hasChanges = false;

    return util.collectAndReportErrors(externalBackgroundLayerIndices.map(function (backgroundLayerIndex) {
        var url = parsedBackground[backgroundLayerIndex].url;

        return util.getDataURIForImageURL(url, options)
            .then(function (dataURI) {
                parsedBackground[backgroundLayerIndex].url = dataURI;

                hasChanges = true;
            }, function (e) {
                throw {
                    resourceType: "backgroundImage",
                    url: e.url,
                    msg: "Unable to load background-image " + e.url
                };
            });
    })).then(function (errors) {
        return {
            backgroundValue: backgroundValueParser.serialize(parsedBackground),
            hasChanges: hasChanges,
            errors: errors
        };
    });
};

var iterateOverRulesAndInlineBackgroundImages = function (cssRules, options) {
    var rulesToInline = findBackgroundImageRules(cssRules),
        backgroundDeclarations = findBackgroundDeclarations(rulesToInline),
        errors = [],
        cssHasChanges = false;

    return Promise.all(backgroundDeclarations.map(function (declaration) {
        return loadAndInlineBackgroundImages(declaration.value, options)
            .then(function (result) {
                if (result.hasChanges) {
                    updateCssPropertyValue(declaration.rule, declaration.property, result.backgroundValue);

                    cssHasChanges = true;
                }

                errors = errors.concat(result.errors);
            });
    })).then(function () {
        return {
            hasChanges: cssHasChanges,
            errors: errors
        };
    });
};

var loadAndInlineFontFace = function (srcDeclarationValue, options) {
    var hasChanges = false,
        parsedFontFaceSources, externalFontFaceUrlIndices;

    try {
        parsedFontFaceSources = fontFaceSrcValueParser.parse(srcDeclarationValue);
    } catch (e) {
        parsedFontFaceSources = [];
    }
    externalFontFaceUrlIndices = findExternalFontFaceUrls(parsedFontFaceSources);

    return util.collectAndReportErrors(externalFontFaceUrlIndices.map(function (urlIndex) {
        var fontSrc = parsedFontFaceSources[urlIndex],
            format = fontSrc.format || "woff";

        return util.binaryAjax(fontSrc.url, options)
            .then(function (content) {
                var base64Content = btoa(content);
                fontSrc.url = 'data:font/' + format + ';base64,' + base64Content;

                hasChanges = true;
            }, function (e) {
                throw {
                    resourceType: "fontFace",
                    url: e.url,
                    msg: "Unable to load font-face " + e.url
                };
            });
    })).then(function (errors) {
        return {
            srcDeclarationValue: fontFaceSrcValueParser.serialize(parsedFontFaceSources),
            hasChanges: hasChanges,
            errors: errors
        };
    });
};

var iterateOverRulesAndInlineFontFace = function (cssRules, options) {
    var rulesToInline = findFontFaceRules(cssRules),
        errors = [],
        hasChanges = false;

    return Promise.all(rulesToInline.map(function (rule) {
        var srcDeclarationValue = rule.style.getPropertyValue("src");

        return loadAndInlineFontFace(srcDeclarationValue, options).then(function (result) {
            if (result.hasChanges) {
                cssSupport.changeFontFaceRuleSrc(cssRules, rule, result.srcDeclarationValue);

                hasChanges = true;
            }

            errors = errors.concat(result.errors);
        });
    })).then(function () {
        return {
            hasChanges: hasChanges,
            errors: errors
        };
    });
};

exports.loadAndInlineCSSResourcesForRules = function (cssRules, options) {
    var hasChanges = false,
        errors = [];

    return Promise.all([iterateOverRulesAndInlineBackgroundImages, iterateOverRulesAndInlineFontFace].map(function (func) {
        return func(cssRules, options)
            .then(function (result) {
                hasChanges = hasChanges || result.hasChanges;
                errors = errors.concat(result.errors);
            });
    })).then(function () {
        return {
            hasChanges: hasChanges,
            errors: errors
        };
    });
};

},{"./backgroundValueParser":3,"./cssSupport":4,"./util":9,"css-font-face-src":2}],7:[function(require,module,exports){
"use strict";

var util = require('./util');


var encodeImageAsDataURI = function (image, options) {
    var url = null;
    if(image.hasAttribute('src')){
        url = image.getAttribute('src');
    }
    else if(image.hasAttributeNS('http://www.w3.org/1999/xlink','href')){
        url = image.getAttributeNS('http://www.w3.org/1999/xlink','href');
    }
    else if(image.hasAttribute('href')){
        url = image.getAttribute('href');
    }
    var documentBase = util.getDocumentBaseUrl(image.ownerDocument),
        ajaxOptions = util.clone(options);

    if (!ajaxOptions.baseUrl && documentBase) {
        ajaxOptions.baseUrl = documentBase;
    }

    return util.getDataURIForImageURL(url, ajaxOptions)
        .then(function (dataURI) {
            return dataURI;
        }, function (e) {
            throw {
                resourceType: "image",
                url: e.url,
                msg: "Unable to load image " + e.url
            };
        });
};

var filterExternalImages = function (images) {
    return images.filter(function (image) {
        var url = null;
        if(image.hasAttribute('src')){
            url = image.getAttribute('src');
        }
        else if(image.hasAttributeNS('http://www.w3.org/1999/xlink','href')){
            url = image.getAttributeNS('http://www.w3.org/1999/xlink','href');
        }
        else if(image.hasAttribute('href')){
            url = image.getAttribute('href');
        }

        return url !== null && !util.isDataUri(url);
    });
};

var filterInputsForImageType = function (inputs) {
    return Array.prototype.filter.call(inputs, function (input) {
        return input.type === "image";
    });
};

var toArray = function (arrayLike) {
    return Array.prototype.slice.call(arrayLike);
};

exports.inline = function (doc, options) {
    var images = toArray(doc.getElementsByTagName("img")),
        svgImages = toArray(doc.getElementsByTagName("image")),
        imageInputs = filterInputsForImageType(doc.getElementsByTagName("input"));

    images = images.concat(svgImages);
    images = images.concat(imageInputs);
    var externalImages = filterExternalImages(images);

    return util.collectAndReportErrors(externalImages.map(function (image) {
        return encodeImageAsDataURI(image, options).then(function (dataURI) {
            if(!!image.attributes.src){
                image.attributes.src.value = dataURI;
            }
            else if(!!image.attributes['xlink:href']){
                image.attributes['xlink:href'].value = dataURI;
            }
            else if(!!image.attributes.href){
                image.attributes.href.value = dataURI;
            }
        });
    }));
};

},{"./util":9}],8:[function(require,module,exports){
"use strict";

var util = require('./util');


var loadLinkedScript = function (script, options) {
    var src = script.attributes.src.value,
        documentBase = util.getDocumentBaseUrl(script.ownerDocument),
        ajaxOptions = util.clone(options);

    if (!ajaxOptions.baseUrl && documentBase) {
        ajaxOptions.baseUrl = documentBase;
    }

    return util.ajax(src, ajaxOptions)
        .catch(function (e) {
            throw {
                resourceType: "script",
                url: e.url,
                msg: "Unable to load script " + e.url
            };
        });
};

var escapeClosingTags = function (text) {
    // http://stackoverflow.com/questions/9246382/escaping-script-tag-inside-javascript
    return text.replace(/<\//g, '<\\/');
};

var substituteExternalScriptWithInline = function (scriptNode, jsCode) {
    scriptNode.attributes.removeNamedItem('src');
    scriptNode.textContent = escapeClosingTags(jsCode);
};

var getScripts = function (doc) {
    var scripts = doc.getElementsByTagName("script");

    return Array.prototype.filter.call(scripts, function (script) {
        return !!script.attributes.src;
    });
};

exports.inline = function (doc, options) {
    var scripts = getScripts(doc);

    return util.collectAndReportErrors(scripts.map(function (script) {
        return loadLinkedScript(script, options).then(function (jsCode) {
            substituteExternalScriptWithInline(script, jsCode);
        });
    }));
};

},{"./util":9}],9:[function(require,module,exports){
"use strict";

var url = require('url');


exports.getDocumentBaseUrl = function (doc) {
    if (doc.baseURI !== 'about:blank') {
        return doc.baseURI;
    }

    return null;
};

exports.clone = function (object) {
    var theClone = {},
        i;
    for (i in object) {
        if (object.hasOwnProperty(i)) {
           theClone[i] = object[i];
        }
    }
    return theClone;
};

exports.cloneArray = function (nodeList) {
    return Array.prototype.slice.apply(nodeList, [0]);
};

exports.joinUrl = function (baseUrl, relUrl) {
    if (!baseUrl) {
        return relUrl;
    }
    return url.resolve(baseUrl, relUrl);
};

exports.isDataUri = function (url) {
    return (/^data:/).test(url);
};

exports.collectAndReportErrors = function (promises) {
    var errors = [];

    return Promise.all(promises.map(function (promise) {
        return promise.catch(function (e) {
            errors.push(e);
        });
    })).then(function () {
        return errors;
    });
};

var lastCacheDate = null;

var getUncachableURL = function (url, cache) {
    if (cache === false || cache === 'none' || cache === 'repeated') {
        if (lastCacheDate === null || cache !== 'repeated') {
            lastCacheDate = Date.now();
        }
        return url + "?_=" + lastCacheDate;
    } else {
        return url;
    }
};

exports.ajax = function (url, options) {
    return new Promise(function (resolve, reject) {
        var ajaxRequest = new window.XMLHttpRequest(),
            joinedUrl = exports.joinUrl(options.baseUrl, url),
            augmentedUrl;

        var doReject = function () {
            reject({
                msg: 'Unable to load url',
                url: joinedUrl
            });
        };

        augmentedUrl = getUncachableURL(joinedUrl, options.cache);

        ajaxRequest.addEventListener("load", function () {
            if (ajaxRequest.status === 200 || ajaxRequest.status === 0) {
                resolve(ajaxRequest.response);
            } else {
                doReject();
            }
        }, false);

        ajaxRequest.addEventListener("error", doReject, false);

        try {
            ajaxRequest.open('GET', augmentedUrl, true);
            ajaxRequest.overrideMimeType(options.mimeType);
            ajaxRequest.send(null);
        } catch (e) {
            doReject();
        }
    });
};

exports.binaryAjax = function (url, options) {
    var ajaxOptions = exports.clone(options);

    ajaxOptions.mimeType = 'text/plain; charset=x-user-defined';

    return exports.ajax(url, ajaxOptions)
        .then(function (content) {
            var binaryContent = "";

            for (var i = 0; i < content.length; i++) {
                binaryContent += String.fromCharCode(content.charCodeAt(i) & 0xFF);
            }

            return binaryContent;
        });
};

var detectMimeType = function (content) {
    var startsWith = function (string, substring) {
        return string.substring(0, substring.length) === substring;
    };

    if (startsWith(content, '<?xml') || startsWith(content, '<svg')) {
        return 'image/svg+xml';
    }
    return 'image/png';
};

exports.getDataURIForImageURL = function (url, options) {
    return exports.binaryAjax(url, options)
        .then(function (content) {
            var base64Content = btoa(content),
                mimeType = detectMimeType(content);

            return 'data:' + mimeType + ';base64,' + base64Content;
        });
};

var uniqueIdList = [];

var constantUniqueIdFor = function (element) {
    // HACK, using a list results in O(n), but how do we hash a function?
    if (uniqueIdList.indexOf(element) < 0) {
        uniqueIdList.push(element);
    }
    return uniqueIdList.indexOf(element);
};

exports.memoize = function (func, hasher, memo) {
    if (typeof memo !== "object") {
        throw new Error("cacheBucket is not an object");
    }

    return function () {
        var args = Array.prototype.slice.call(arguments);

        var argumentHash = hasher(args),
            funcHash = constantUniqueIdFor(func),
            retValue;

        if (memo[funcHash] && memo[funcHash][argumentHash]) {
            return memo[funcHash][argumentHash];
        } else {
            retValue = func.apply(null, args);

            memo[funcHash] = memo[funcHash] || {};
            memo[funcHash][argumentHash] = retValue;

            return retValue;
        }
    };
};

},{"url":15}],10:[function(require,module,exports){
(function (global){
/*! https://mths.be/punycode v1.3.2 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.3.2',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],11:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],12:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return map(obj[k], function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],13:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":11,"./encode":12}],14:[function(require,module,exports){
'use strict';

var innerXML = function (node) {
    var s = new XMLSerializer();
    return Array.prototype.map.call(node.childNodes, function (node) {
        return s.serializeToString(node);
    }).join('');
};

var getParseError = function (doc) {
    // Firefox
    if (doc.documentElement.tagName === 'parsererror' &&
        doc.documentElement.namespaceURI === 'http://www.mozilla.org/newlayout/xml/parsererror.xml') {
        return doc.documentElement;
    }

    // Chrome, Safari
    if ((doc.documentElement.tagName === 'xml' || doc.documentElement.tagName === 'html') &&
        doc.documentElement.childNodes &&
        doc.documentElement.childNodes.length > 0 &&
        doc.documentElement.childNodes[0].nodeName === 'parsererror') {
        return doc.documentElement.childNodes[0];
    }

    // PhantomJS
    if (doc.documentElement.tagName === 'html' &&
        doc.documentElement.childNodes &&
        doc.documentElement.childNodes.length > 0 &&
        doc.documentElement.childNodes[0].nodeName === 'body' &&
        doc.documentElement.childNodes[0].childNodes &&
        doc.documentElement.childNodes[0].childNodes.length &&
        doc.documentElement.childNodes[0].childNodes[0].nodeName === 'parsererror') {
        return doc.documentElement.childNodes[0].childNodes[0];
    }

    return undefined;
};

var errorMessagePatterns = [
    // Chrome, Safari, PhantomJS
    new RegExp('^<h3[^>]*>This page contains the following errors:<\/h3><div[^>]*>(.+?)\n?<\/div>'),
    // Firefox
    new RegExp('^(.+)\n')
];

var extractParseError = function (errorNode) {
    var content = innerXML(errorNode);
    var i, match;

    for(i = 0; i < errorMessagePatterns.length; i++) {
        match = errorMessagePatterns[i].exec(content);

        if (match) {
            return match[1];
        }
    }
    return undefined;
};

var failOnParseError = function (doc) {
    var errorMessage;

    if (doc === null) {
        throw new Error('Parse error');
    }

    var parseError = getParseError(doc);
    if (parseError !== undefined) {
        errorMessage = extractParseError(parseError) || 'Parse error';
        throw new Error(errorMessage);
    }
};

exports.failOnParseError = function (doc) {
    failOnParseError(doc);

    return doc;
};

},{}],15:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var punycode = require('punycode');
var util = require('./util');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // Special case for a simple path URL
    simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && util.isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!util.isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  // Copy chrome, IE, opera backslash-handling behavior.
  // Back slashes before the query string get converted to forward slashes
  // See: https://code.google.com/p/chromium/issues/detail?id=25916
  var queryIndex = url.indexOf('?'),
      splitter =
          (queryIndex !== -1 && queryIndex < url.indexOf('#')) ? '?' : '#',
      uSplit = url.split(splitter),
      slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a punycoded representation of "domain".
      // It only converts parts of the domain name that
      // have non-ASCII characters, i.e. it doesn't matter if
      // you call it with a domain that already is ASCII-only.
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1)
        continue;
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (util.isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      util.isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (util.isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol')
        result[rkey] = relative[rkey];
    }

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!util.isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especially happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host || srcPath.length > 1) &&
      (last === '.' || last === '..') || last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especially happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!util.isNull(result.pathname) || !util.isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

},{"./util":16,"punycode":10,"querystring":13}],16:[function(require,module,exports){
'use strict';

module.exports = {
  isString: function(arg) {
    return typeof(arg) === 'string';
  },
  isObject: function(arg) {
    return typeof(arg) === 'object' && arg !== null;
  },
  isNull: function(arg) {
    return arg === null;
  },
  isNullOrUndefined: function(arg) {
    return arg == null;
  }
};

},{}],17:[function(require,module,exports){
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.xmlserializer = factory();
    }
}(this, function () {

    var removeInvalidCharacters = function (content) {
        // See http://www.w3.org/TR/xml/#NT-Char for valid XML 1.0 characters
        return content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
    };

    var serializeAttributeValue = function (value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };

    var serializeTextContent = function (content) {
        return content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    };

    var serializeAttribute = function (attr) {
        var value = attr.value;

        return ' ' + attr.name + '="' + serializeAttributeValue(value) + '"';
    };

    var getTagName = function (node) {
        var tagName = node.tagName;

        // Aid in serializing of original HTML documents
        if (node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
            tagName = tagName.toLowerCase();
        }
        return tagName;
    };

    var serializeNamespace = function (node, isRootNode) {
        var nodeHasXmlnsAttr = Array.prototype.map.call(node.attributes || node.attrs, function (attr) {
            return attr.name;
        })
                .indexOf('xmlns') >= 0;
        // Serialize the namespace as an xmlns attribute whenever the element
        // doesn't already have one and the inherited namespace does not match
        // the element's namespace.
        if (!nodeHasXmlnsAttr &&
            (isRootNode ||
             node.namespaceURI !== node.parentNode.namespaceURI)) {
            return ' xmlns="' + node.namespaceURI + '"';
        } else {
            return '';
        }
    };

    var serializeChildren = function (node) {
        return Array.prototype.map.call(node.childNodes, function (childNode) {
            return nodeTreeToXHTML(childNode);
        }).join('');
    };

    var serializeTag = function (node, isRootNode) {
        var output = '<' + getTagName(node);
        output += serializeNamespace(node, isRootNode);

        Array.prototype.forEach.call(node.attributes || node.attrs, function (attr) {
            output += serializeAttribute(attr);
        });

        if (node.childNodes.length > 0) {
            output += '>';
            output += serializeChildren(node);
            output += '</' + getTagName(node) + '>';
        } else {
            output += '/>';
        }
        return output;
    };

    var serializeText = function (node) {
        var text = node.nodeValue || node.value || '';
        return serializeTextContent(text);
    };

    var serializeComment = function (node) {
        return '<!--' +
            node.data
            .replace(/-/g, '&#45;') +
            '-->';
    };

    var serializeCDATA = function (node) {
        return '<![CDATA[' + node.nodeValue + ']]>';
    };

    var nodeTreeToXHTML = function (node, options) {
        var isRootNode = options && options.rootNode;

        if (node.nodeName === '#document' ||
            node.nodeName === '#document-fragment') {
            return serializeChildren(node);
        } else {
            if (node.tagName) {
                return serializeTag(node, isRootNode);
            } else if (node.nodeName === '#text') {
                return serializeText(node);
            } else if (node.nodeName === '#comment') {
                return serializeComment(node);
            } else if (node.nodeName === '#cdata-section') {
                return serializeCDATA(node);
            }
        }
    };

    return {
        serializeToString: function (node) {
            return removeInvalidCharacters(nodeTreeToXHTML(node, {rootNode: true}));
        }
    };
}));

},{}]},{},[1])(1)
});
