
/*!
 * justifiedGallery - v3.8.1 (Vanilla JS conversion by cfconsultancy) to v.4
 * https://miromannino.github.io/Justified-Gallery/
 * Copyright (c) 2020 Miro Mannino
 * Licensed under the MIT license.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.JustifiedGallery = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  // Utility functions
  const utils = {
    isFunction(obj) {
      return typeof obj === 'function';
    },

    isString(obj) {
      return typeof obj === 'string';
    },

    isObject(obj) {
      return typeof obj === 'object' && obj !== null;
    },

    isBoolean(obj) {
      return typeof obj === 'boolean';
    },

    extend(...args) {
      const result = {};
      args.forEach(obj => {
        if (obj) {
          Object.keys(obj).forEach(key => {
            result[key] = obj[key];
          });
        }
      });
      return result;
    },

    addClass(el, className) {
      if (el.classList) {
        el.classList.add(className);
      } else {
        el.className += ' ' + className;
      }
    },

    removeClass(el, className) {
      if (el.classList) {
        el.classList.remove(className);
      } else {
        el.className = el.className.replace(new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
      }
    },

    hasClass(el, className) {
      if (el.classList) {
        return el.classList.contains(className);
      }
      return new RegExp('(^| )' + className + '( |$)', 'gi').test(el.className);
    },

    fadeIn(el, duration, callback) {
      el.style.opacity = 0;
      el.style.display = 'block';

      const start = performance.now();
      const animate = (time) => {
        const progress = Math.min((time - start) / duration, 1);
        el.style.opacity = progress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else if (callback) {
          callback();
        }
      };
      requestAnimationFrame(animate);
    },

    fadeTo(el, duration, opacity, callback) {
      const startOpacity = parseFloat(getComputedStyle(el).opacity) || 0;
      const start = performance.now();

      const animate = (time) => {
        const progress = Math.min((time - start) / duration, 1);
        el.style.opacity = startOpacity + (opacity - startOpacity) * progress;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else if (callback) {
          callback();
        }
      };
      requestAnimationFrame(animate);
    },

    trigger(el, eventName, detail) {
      const event = new CustomEvent(eventName, { detail: detail || {} });
      el.dispatchEvent(event);
    }
  };

  /**
   * Justified Gallery constructor
   */
  class JustifiedGallery {
    constructor(gallery, settings) {
      this.gallery = gallery;
      this.settings = utils.extend({}, this.defaults, settings);
      this.checkSettings();

      this.imgAnalyzerTimeout = null;
      this.entries = null;
      this.buildingRow = {
        entriesBuff: [],
        width: 0,
        height: 0,
        aspectRatio: 0
      };
      this.lastFetchedEntry = null;
      this.lastAnalyzedIndex = -1;
      this.yield = {
        every: 2,
        flushed: 0
      };
      this.border = this.settings.border >= 0 ? this.settings.border : this.settings.margins;
      this.maxRowHeight = this.retrieveMaxRowHeight();
      this.suffixRanges = this.retrieveSuffixRanges();
      this.offY = this.border;
      this.rows = 0;
      this.spinner = {
        phase: 0,
        timeSlot: 150,
        el: this.createSpinnerElement(),
        intervalId: null
      };
      this.scrollBarOn = false;
      this.checkWidthIntervalId = null;
      this.galleryWidth = this.gallery.offsetWidth;
      this.galleryPrevStaticHeight = 0;

      // Store data directly on elements
      this.elementData = new WeakMap();
    }

    createSpinnerElement() {
      const spinner = document.createElement('div');
      spinner.className = 'jg-spinner';
      for (let i = 0; i < 3; i++) {
        spinner.appendChild(document.createElement('span'));
      }
      return spinner;
    }

    setData(el, key, value) {
      let data = this.elementData.get(el);
      if (!data) {
        data = {};
        this.elementData.set(el, data);
      }
      data[key] = value;
    }

    getData(el, key) {
      const data = this.elementData.get(el);
      return data ? data[key] : undefined;
    }

    removeData(el, key) {
      const data = this.elementData.get(el);
      if (data && key in data) {
        delete data[key];
      }
    }

    getSuffix(width, height) {
      const longestSide = Math.max(width, height);
      for (let i = 0; i < this.suffixRanges.length; i++) {
        if (longestSide <= this.suffixRanges[i]) {
          return this.settings.sizeRangeSuffixes[this.suffixRanges[i]];
        }
      }
      return this.settings.sizeRangeSuffixes[this.suffixRanges[this.suffixRanges.length - 1]];
    }

    removeSuffix(str, suffix) {
      return str.substring(0, str.length - suffix.length);
    }

    endsWith(str, suffix) {
      return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }

    getUsedSuffix(str) {
      for (let si in this.settings.sizeRangeSuffixes) {
        if (this.settings.sizeRangeSuffixes.hasOwnProperty(si)) {
          if (this.settings.sizeRangeSuffixes[si].length === 0) continue;
          if (this.endsWith(str, this.settings.sizeRangeSuffixes[si])) {
            return this.settings.sizeRangeSuffixes[si];
          }
        }
      }
      return '';
    }

    newSrc(imageSrc, imgWidth, imgHeight, image) {
      let newImageSrc;

      if (this.settings.thumbnailPath) {
        newImageSrc = this.settings.thumbnailPath(imageSrc, imgWidth, imgHeight, image);
      } else {
        const matchRes = imageSrc.match(this.settings.extension);
        const ext = matchRes !== null ? matchRes[0] : '';
        newImageSrc = imageSrc.replace(this.settings.extension, '');
        newImageSrc = this.removeSuffix(newImageSrc, this.getUsedSuffix(newImageSrc));
        newImageSrc += this.getSuffix(imgWidth, imgHeight) + ext;
      }

      return newImageSrc;
    }

    showImg(entry, callback) {
      if (this.settings.cssAnimation) {
        utils.addClass(entry, 'jg-entry-visible');
        if (callback) callback();
      } else {
        utils.fadeTo(entry, this.settings.imagesAnimationDuration, 1.0, callback);
        const img = this.imgFromEntry(entry);
        if (img) {
          utils.fadeTo(img, this.settings.imagesAnimationDuration, 1.0);
        }
      }
    }

    extractImgSrcFromImage(image) {
      let imageSrc = image.getAttribute('data-safe-src');
      let imageSrcLoc = 'data-safe-src';
      if (!imageSrc) {
        imageSrc = image.getAttribute('src');
        imageSrcLoc = 'src';
      }
      this.setData(image, 'jg.originalSrc', imageSrc);
      this.setData(image, 'jg.src', imageSrc);
      this.setData(image, 'jg.originalSrcLoc', imageSrcLoc);
      return imageSrc;
    }

    imgFromEntry(entry) {
      // Parse the selector to handle child combinators
      const selectors = this.settings.imgSelector.split(',').map(s => s.trim());
      for (let selector of selectors) {
        // Remove leading '>' and search within entry
        const cleanSelector = selector.replace(/^>\s*/, '');
        const elements = Array.from(entry.querySelectorAll(cleanSelector));
        // Filter to only direct children if original had '>'
        const img = selector.startsWith('>')
          ? elements.find(el => el.parentNode === entry)
          : elements[0];
        if (img) return img;
      }
      return null;
    }

    captionFromEntry(entry) {
      // Find direct child with class jg-caption
      const captions = Array.from(entry.querySelectorAll('.jg-caption'));
      return captions.find(el => el.parentNode === entry) || null;
    }

    displayEntry(entry, x, y, imgWidth, imgHeight, rowHeight) {
      entry.style.width = imgWidth + 'px';
      entry.style.height = rowHeight + 'px';
      entry.style.top = y + 'px';
      entry.style.left = x + 'px';

      const image = this.imgFromEntry(entry);
      if (image !== null) {
        image.style.width = imgWidth + 'px';
        image.style.height = imgHeight + 'px';
        image.style.marginLeft = (-imgWidth / 2) + 'px';
        image.style.marginTop = (-imgHeight / 2) + 'px';

        let imageSrc = this.getData(image, 'jg.src');
        if (imageSrc) {
          imageSrc = this.newSrc(imageSrc, imgWidth, imgHeight, image);

          image.addEventListener('error', () => {
            this.resetImgSrc(image);
          }, { once: true });

          const loadNewImage = () => {
            image.setAttribute('src', imageSrc);
          };

          if (this.getData(entry, 'jg.loaded') === 'skipped' && imageSrc) {
            this.onImageEvent(imageSrc, () => {
              this.showImg(entry, loadNewImage);
              this.setData(entry, 'jg.loaded', true);
            });
          } else {
            this.showImg(entry, loadNewImage);
          }
        }
      } else {
        this.showImg(entry);
      }

      this.displayEntryCaption(entry);
    }

    displayEntryCaption(entry) {
      const image = this.imgFromEntry(entry);
      if (image !== null && this.settings.captions) {
        let imgCaption = this.captionFromEntry(entry);

        if (imgCaption === null) {
          let caption = image.getAttribute('alt');
          if (!this.isValidCaption(caption)) {
            caption = entry.getAttribute('title');
          }
          if (this.isValidCaption(caption)) {
            imgCaption = document.createElement('div');
            imgCaption.className = 'jg-caption';
            imgCaption.textContent = caption;
            entry.appendChild(imgCaption);
            this.setData(entry, 'jg.createdCaption', true);
          }
        }

        if (imgCaption !== null) {
          if (!this.settings.cssAnimation) {
            imgCaption.style.opacity = this.settings.captionSettings.nonVisibleOpacity;
          }
          this.addCaptionEventsHandlers(entry);
        }
      } else {
        this.removeCaptionEventsHandlers(entry);
      }
    }

    isValidCaption(caption) {
      return caption && caption.length > 0;
    }

    onEntryMouseEnterForCaption(event) {
      const caption = this.captionFromEntry(event.currentTarget);
      if (this.settings.cssAnimation) {
        utils.addClass(caption, 'jg-caption-visible');
        utils.removeClass(caption, 'jg-caption-hidden');
      } else {
        utils.fadeTo(caption, this.settings.captionSettings.animationDuration,
          this.settings.captionSettings.visibleOpacity);
      }
    }

    onEntryMouseLeaveForCaption(event) {
      const caption = this.captionFromEntry(event.currentTarget);
      if (this.settings.cssAnimation) {
        utils.removeClass(caption, 'jg-caption-visible');
        utils.removeClass(caption, 'jg-caption-hidden');
      } else {
        utils.fadeTo(caption, this.settings.captionSettings.animationDuration,
          this.settings.captionSettings.nonVisibleOpacity);
      }
    }

    addCaptionEventsHandlers(entry) {
      let captionMouseEvents = this.getData(entry, 'jg.captionMouseEvents');
      if (typeof captionMouseEvents === 'undefined') {
        captionMouseEvents = {
          mouseenter: this.onEntryMouseEnterForCaption.bind(this),
          mouseleave: this.onEntryMouseLeaveForCaption.bind(this)
        };
        entry.addEventListener('mouseenter', captionMouseEvents.mouseenter);
        entry.addEventListener('mouseleave', captionMouseEvents.mouseleave);
        this.setData(entry, 'jg.captionMouseEvents', captionMouseEvents);
      }
    }

    removeCaptionEventsHandlers(entry) {
      const captionMouseEvents = this.getData(entry, 'jg.captionMouseEvents');
      if (typeof captionMouseEvents !== 'undefined') {
        entry.removeEventListener('mouseenter', captionMouseEvents.mouseenter);
        entry.removeEventListener('mouseleave', captionMouseEvents.mouseleave);
        this.removeData(entry, 'jg.captionMouseEvents');
      }
    }

    clearBuildingRow() {
      this.buildingRow.entriesBuff = [];
      this.buildingRow.aspectRatio = 0;
      this.buildingRow.width = 0;
    }

    prepareBuildingRow(isLastRow, hiddenRow) {
      let i, entry, imgAspectRatio, newImgW, newImgH, justify = true;
      let minHeight = 0;
      const availableWidth = this.galleryWidth - 2 * this.border -
        ((this.buildingRow.entriesBuff.length - 1) * this.settings.margins);
      const rowHeight = availableWidth / this.buildingRow.aspectRatio;
      let defaultRowHeight = this.settings.rowHeight;
      const justifiable = this.buildingRow.width / availableWidth > this.settings.justifyThreshold;

      if (hiddenRow || (isLastRow && this.settings.lastRow === 'hide' && !justifiable)) {
        for (i = 0; i < this.buildingRow.entriesBuff.length; i++) {
          entry = this.buildingRow.entriesBuff[i];
          if (this.settings.cssAnimation) {
            utils.removeClass(entry, 'jg-entry-visible');
          } else {
            utils.fadeTo(entry, 0, 0.1);
            const img = entry.querySelector('> img, > a > img');
            if (img) utils.fadeTo(img, 0, 0);
          }
        }
        return -1;
      }

      if (isLastRow && !justifiable && this.settings.lastRow !== 'justify' && this.settings.lastRow !== 'hide') {
        justify = false;

        if (this.rows > 0) {
          defaultRowHeight = (this.offY - this.border - this.settings.margins * this.rows) / this.rows;
          justify = defaultRowHeight * this.buildingRow.aspectRatio / availableWidth > this.settings.justifyThreshold;
        }
      }

      let availWidth = availableWidth;
      for (i = 0; i < this.buildingRow.entriesBuff.length; i++) {
        entry = this.buildingRow.entriesBuff[i];
        imgAspectRatio = this.getData(entry, 'jg.width') / this.getData(entry, 'jg.height');

        if (justify) {
          newImgW = (i === this.buildingRow.entriesBuff.length - 1) ? availWidth : rowHeight * imgAspectRatio;
          newImgH = rowHeight;
        } else {
          newImgW = defaultRowHeight * imgAspectRatio;
          newImgH = defaultRowHeight;
        }

        availWidth -= Math.round(newImgW);
        this.setData(entry, 'jg.jwidth', Math.round(newImgW));
        this.setData(entry, 'jg.jheight', Math.ceil(newImgH));
        if (i === 0 || minHeight > newImgH) minHeight = newImgH;
      }

      this.buildingRow.height = minHeight;
      return justify;
    }

    flushRow(isLastRow, hiddenRow) {
      const settings = this.settings;
      let entry, buildingRowRes, offX = this.border, i;

      buildingRowRes = this.prepareBuildingRow(isLastRow, hiddenRow);
      if (hiddenRow || (isLastRow && settings.lastRow === 'hide' && buildingRowRes === -1)) {
        this.clearBuildingRow();
        return;
      }

      if (this.maxRowHeight) {
        if (this.maxRowHeight < this.buildingRow.height) {
          this.buildingRow.height = this.maxRowHeight;
        }
      }

      if (isLastRow && (settings.lastRow === 'center' || settings.lastRow === 'right')) {
        let availableWidth = this.galleryWidth - 2 * this.border -
          (this.buildingRow.entriesBuff.length - 1) * settings.margins;

        for (i = 0; i < this.buildingRow.entriesBuff.length; i++) {
          entry = this.buildingRow.entriesBuff[i];
          availableWidth -= this.getData(entry, 'jg.jwidth');
        }

        if (settings.lastRow === 'center') {
          offX += Math.round(availableWidth / 2);
        } else if (settings.lastRow === 'right') {
          offX += availableWidth;
        }
      }

      const lastEntryIdx = this.buildingRow.entriesBuff.length - 1;
      for (i = 0; i <= lastEntryIdx; i++) {
        entry = this.buildingRow.entriesBuff[this.settings.rtl ? lastEntryIdx - i : i];
        this.displayEntry(entry, offX, this.offY,
          this.getData(entry, 'jg.jwidth'),
          this.getData(entry, 'jg.jheight'),
          this.buildingRow.height);
        offX += this.getData(entry, 'jg.jwidth') + settings.margins;
      }

      this.galleryHeightToSet = this.offY + this.buildingRow.height + this.border;
      this.setGalleryTempHeight(this.galleryHeightToSet + this.getSpinnerHeight());

      if (!isLastRow || (this.buildingRow.height <= settings.rowHeight && buildingRowRes)) {
        this.offY += this.buildingRow.height + settings.margins;
        this.rows += 1;
        this.clearBuildingRow();
        this.settings.triggerEvent.call(this, 'jg.rowflush');
      }
    }

    rememberGalleryHeight() {
      this.galleryPrevStaticHeight = this.gallery.offsetHeight;
      this.gallery.style.height = this.galleryPrevStaticHeight + 'px';
    }

    setGalleryTempHeight(height) {
      this.galleryPrevStaticHeight = Math.max(height, this.galleryPrevStaticHeight);
      this.gallery.style.height = this.galleryPrevStaticHeight + 'px';
    }

    setGalleryFinalHeight(height) {
      this.galleryPrevStaticHeight = height;
      this.gallery.style.height = height + 'px';
    }

    checkWidth() {
      this.checkWidthIntervalId = setInterval(() => {
        const isVisible = this.gallery.offsetParent !== null;
        if (!isVisible) return;

        const galleryWidth = parseFloat(this.gallery.offsetWidth);
        if (Math.abs(galleryWidth - this.galleryWidth) > this.settings.refreshSensitivity) {
          this.galleryWidth = galleryWidth;
          this.rewind();
          this.rememberGalleryHeight();
          this.startImgAnalyzer(true);
        }
      }, this.settings.refreshTime);
    }

    isSpinnerActive() {
      return this.spinner.intervalId !== null;
    }

    getSpinnerHeight() {
      return this.spinner.el.offsetHeight || 0;
    }

    stopLoadingSpinnerAnimation() {
      clearInterval(this.spinner.intervalId);
      this.spinner.intervalId = null;
      this.setGalleryTempHeight(this.gallery.offsetHeight - this.getSpinnerHeight());
      if (this.spinner.el.parentNode) {
        this.spinner.el.parentNode.removeChild(this.spinner.el);
      }
    }

    startLoadingSpinnerAnimation() {
      const spinnerContext = this.spinner;
      const spinnerPoints = spinnerContext.el.querySelectorAll('span');
      clearInterval(spinnerContext.intervalId);
      this.gallery.appendChild(spinnerContext.el);
      this.setGalleryTempHeight(this.offY + this.buildingRow.height + this.getSpinnerHeight());
      spinnerContext.intervalId = setInterval(() => {
        if (spinnerContext.phase < spinnerPoints.length) {
          utils.fadeTo(spinnerPoints[spinnerContext.phase], spinnerContext.timeSlot, 1);
        } else {
          utils.fadeTo(spinnerPoints[spinnerContext.phase - spinnerPoints.length], spinnerContext.timeSlot, 0);
        }
        spinnerContext.phase = (spinnerContext.phase + 1) % (spinnerPoints.length * 2);
      }, spinnerContext.timeSlot);
    }

    rewind() {
      this.lastFetchedEntry = null;
      this.lastAnalyzedIndex = -1;
      this.offY = this.border;
      this.rows = 0;
      this.clearBuildingRow();
    }

    getSelectorWithoutSpinner() {
      return this.settings.selector + ', div:not(.jg-spinner)';
    }

    getAllEntries() {
      // Handle selectors, filtering out spinner
      const selectorParts = this.settings.selector.split(',').map(s => s.trim());
      const allChildren = Array.from(this.gallery.children);

      return allChildren.filter(child => {
        // Exclude spinner
        if (child.classList && child.classList.contains('jg-spinner')) {
          return false;
        }
        // Check if matches any selector
        return selectorParts.some(selector => {
          try {
            return child.matches(selector);
          } catch (e) {
            return false;
          }
        });
      });
    }

    updateEntries(norewind) {
      let newEntries;

      if (norewind && this.lastFetchedEntry != null) {
        const selector = this.getSelectorWithoutSpinner();
        let sibling = this.lastFetchedEntry.nextElementSibling;
        newEntries = [];
        while (sibling) {
          if (sibling.matches(selector)) {
            newEntries.push(sibling);
          }
          sibling = sibling.nextElementSibling;
        }
      } else {
        this.entries = [];
        newEntries = this.getAllEntries();
      }

      if (newEntries.length > 0) {
        if (utils.isFunction(this.settings.sort)) {
          newEntries = this.sortArray(newEntries);
        } else if (this.settings.randomize) {
          newEntries = this.shuffleArray(newEntries);
        }
        this.lastFetchedEntry = newEntries[newEntries.length - 1];

        if (this.settings.filter) {
          newEntries = this.filterArray(newEntries);
        } else {
          this.resetFilters(newEntries);
        }
      }

      this.entries = this.entries.concat(newEntries);
      return true;
    }

    insertToGallery(entries) {
      entries.forEach(entry => {
        this.gallery.appendChild(entry);
      });
    }

    shuffleArray(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      this.insertToGallery(a);
      return a;
    }

    sortArray(a) {
      a.sort(this.settings.sort);
      this.insertToGallery(a);
      return a;
    }

    resetFilters(a) {
      a.forEach(entry => utils.removeClass(entry, 'jg-filtered'));
    }

    filterArray(a) {
      const settings = this.settings;
      if (utils.isString(settings.filter)) {
        return a.filter(el => {
          if (el.matches(settings.filter)) {
            utils.removeClass(el, 'jg-filtered');
            return true;
          } else {
            utils.addClass(el, 'jg-filtered');
            utils.removeClass(el, 'jg-visible');
            return false;
          }
        });
      } else if (utils.isFunction(settings.filter)) {
        const filteredArr = a.filter(settings.filter);
        a.forEach(entry => {
          if (filteredArr.indexOf(entry) === -1) {
            utils.addClass(entry, 'jg-filtered');
            utils.removeClass(entry, 'jg-visible');
          } else {
            utils.removeClass(entry, 'jg-filtered');
          }
        });
        return filteredArr;
      }
    }

    resetImgSrc(img) {
      if (this.getData(img, 'jg.originalSrcLoc') === 'src') {
        img.setAttribute('src', this.getData(img, 'jg.originalSrc'));
      } else {
        img.setAttribute('src', '');
      }
    }

    destroy() {
      clearInterval(this.checkWidthIntervalId);
      this.stopImgAnalyzerStarter();

      this.getAllEntries().forEach(entry => {
        entry.style.width = '';
        entry.style.height = '';
        entry.style.top = '';
        entry.style.left = '';
        this.removeData(entry, 'jg.loaded');
        utils.removeClass(entry, 'jg-entry');
        utils.removeClass(entry, 'jg-filtered');
        utils.removeClass(entry, 'jg-entry-visible');

        const img = this.imgFromEntry(entry);
        if (img) {
          img.style.width = '';
          img.style.height = '';
          img.style.marginLeft = '';
          img.style.marginTop = '';
          this.resetImgSrc(img);
          this.removeData(img, 'jg.originalSrc');
          this.removeData(img, 'jg.originalSrcLoc');
          this.removeData(img, 'jg.src');
        }

        this.removeCaptionEventsHandlers(entry);
        const caption = this.captionFromEntry(entry);
        if (this.getData(entry, 'jg.createdCaption')) {
          this.removeData(entry, 'jg.createdCaption');
          if (caption !== null) caption.remove();
        } else {
          if (caption !== null) caption.style.opacity = 1;
        }
      });

      this.gallery.style.height = '';
      utils.removeClass(this.gallery, 'justified-gallery');
      this.elementData.delete(this.gallery);
      this.settings.triggerEvent.call(this, 'jg.destroy');
    }

    analyzeImages(isForResize) {
      for (let i = this.lastAnalyzedIndex + 1; i < this.entries.length; i++) {
        const entry = this.entries[i];
        const loaded = this.getData(entry, 'jg.loaded');

        if (loaded === true || loaded === 'skipped') {
          const availableWidth = this.galleryWidth - 2 * this.border -
            ((this.buildingRow.entriesBuff.length - 1) * this.settings.margins);
          const imgAspectRatio = this.getData(entry, 'jg.width') / this.getData(entry, 'jg.height');

          this.buildingRow.entriesBuff.push(entry);
          this.buildingRow.aspectRatio += imgAspectRatio;
          this.buildingRow.width += imgAspectRatio * this.settings.rowHeight;
          this.lastAnalyzedIndex = i;

          if (availableWidth / (this.buildingRow.aspectRatio + imgAspectRatio) < this.settings.rowHeight) {
            this.flushRow(false, this.settings.maxRowsCount > 0 && this.rows === this.settings.maxRowsCount);

            if (++this.yield.flushed >= this.yield.every) {
              this.startImgAnalyzer(isForResize);
              return;
            }
          }
        } else if (loaded !== 'error') {
          return;
        }
      }

      if (this.buildingRow.entriesBuff.length > 0) {
        this.flushRow(true, this.settings.maxRowsCount > 0 && this.rows === this.settings.maxRowsCount);
      }

      if (this.isSpinnerActive()) {
        this.stopLoadingSpinnerAnimation();
      }

      this.stopImgAnalyzerStarter();
      this.setGalleryFinalHeight(this.galleryHeightToSet);
      this.settings.triggerEvent.call(this, isForResize ? 'jg.resize' : 'jg.complete');
    }

    stopImgAnalyzerStarter() {
      this.yield.flushed = 0;
      if (this.imgAnalyzerTimeout !== null) {
        clearTimeout(this.imgAnalyzerTimeout);
        this.imgAnalyzerTimeout = null;
      }
    }

    startImgAnalyzer(isForResize) {
      this.stopImgAnalyzerStarter();
      this.imgAnalyzerTimeout = setTimeout(() => {
        this.analyzeImages(isForResize);
      }, 1);
    }

    onImageEvent(imageSrc, onLoad, onError) {
      if (!onLoad && !onError) return;

      const memImage = new Image();
      let loadHandler, errorHandler;

      if (onLoad) {
        loadHandler = function() {
          memImage.removeEventListener('load', loadHandler);
          if (errorHandler) memImage.removeEventListener('error', errorHandler);
          onLoad(memImage);
        };
        memImage.addEventListener('load', loadHandler);
      }

      if (onError) {
        errorHandler = function() {
          if (loadHandler) memImage.removeEventListener('load', loadHandler);
          memImage.removeEventListener('error', errorHandler);
          onError(memImage);
        };
        memImage.addEventListener('error', errorHandler);
      }

      memImage.src = imageSrc;
    }

    init() {
      let imagesToLoad = false;
      let skippedImages = false;

      this.entries.forEach((entry, index) => {
        const image = this.imgFromEntry(entry);

        utils.addClass(entry, 'jg-entry');

        if (this.getData(entry, 'jg.loaded') !== true && this.getData(entry, 'jg.loaded') !== 'skipped') {
          if (this.settings.rel !== null) {
            entry.setAttribute('rel', this.settings.rel);
          }

          if (this.settings.target !== null) {
            entry.setAttribute('target', this.settings.target);
          }

          if (image !== null) {
            const imageSrc = this.extractImgSrcFromImage(image);

            if (this.settings.waitThumbnailsLoad === false || !imageSrc) {
              let width = parseFloat(image.getAttribute('width'));
              let height = parseFloat(image.getAttribute('height'));

              if (image.tagName.toLowerCase() === 'svg') {
                const bbox = image.getBBox();
                width = parseFloat(bbox.width);
                height = parseFloat(bbox.height);
              }

              if (!isNaN(width) && !isNaN(height)) {
                this.setData(entry, 'jg.width', width);
                this.setData(entry, 'jg.height', height);
                this.setData(entry, 'jg.loaded', 'skipped');
                skippedImages = true;
                this.startImgAnalyzer(false);
                return;
              }
            }

            this.setData(entry, 'jg.loaded', false);
            imagesToLoad = true;

            if (!this.isSpinnerActive()) {
              this.startLoadingSpinnerAnimation();
            }

            this.onImageEvent(imageSrc,
              (loadImg) => {
                this.setData(entry, 'jg.width', loadImg.width);
                this.setData(entry, 'jg.height', loadImg.height);
                this.setData(entry, 'jg.loaded', true);
                this.startImgAnalyzer(false);
              },
              () => {
                this.setData(entry, 'jg.loaded', 'error');
                this.startImgAnalyzer(false);
              }
            );
          } else {
            this.setData(entry, 'jg.loaded', true);
            this.setData(entry, 'jg.width',
              entry.offsetWidth || parseFloat(getComputedStyle(entry).width) || 1);
            this.setData(entry, 'jg.height',
              entry.offsetHeight || parseFloat(getComputedStyle(entry).height) || 1);
          }
        }
      });

      if (!imagesToLoad && !skippedImages) {
        this.startImgAnalyzer(false);
      }
      this.checkWidth();
    }

    checkOrConvertNumber(settingContainer, settingName) {
      if (typeof settingContainer[settingName] === 'string') {
        settingContainer[settingName] = parseFloat(settingContainer[settingName]);
      }

      if (typeof settingContainer[settingName] === 'number') {
        if (isNaN(settingContainer[settingName])) {
          throw 'invalid number for ' + settingName;
        }
      } else {
        throw settingName + ' must be a number';
      }
    }

    checkSizeRangesSuffixes() {
      if (!utils.isObject(this.settings.sizeRangeSuffixes)) {
        throw 'sizeRangeSuffixes must be defined and must be an object';
      }

      const suffixRanges = Object.keys(this.settings.sizeRangeSuffixes);
      const newSizeRngSuffixes = { 0: '' };

      suffixRanges.forEach(rangeIdx => {
        if (typeof rangeIdx === 'string') {
          try {
            const numIdx = parseInt(rangeIdx.replace(/^[a-z]+/, ''), 10);
            newSizeRngSuffixes[numIdx] = this.settings.sizeRangeSuffixes[rangeIdx];
          } catch (e) {
            throw 'sizeRangeSuffixes keys must contains correct numbers (' + e + ')';
          }
        } else {
          newSizeRngSuffixes[rangeIdx] = this.settings.sizeRangeSuffixes[rangeIdx];
        }
      });

      this.settings.sizeRangeSuffixes = newSizeRngSuffixes;
    }

    retrieveMaxRowHeight() {
      let newMaxRowHeight = null;
      const rowHeight = this.settings.rowHeight;

      if (typeof this.settings.maxRowHeight === 'string') {
        if (this.settings.maxRowHeight.match(/^[0-9]+%$/)) {
          newMaxRowHeight = rowHeight * parseFloat(this.settings.maxRowHeight.match(/^([0-9]+)%$/)[1]) / 100;
        } else {
          newMaxRowHeight = parseFloat(this.settings.maxRowHeight);
        }
      } else if (typeof this.settings.maxRowHeight === 'number') {
        newMaxRowHeight = this.settings.maxRowHeight;
      } else if (this.settings.maxRowHeight === false || this.settings.maxRowHeight == null) {
        return null;
      } else {
        throw 'maxRowHeight must be a number or a percentage';
      }

      if (isNaN(newMaxRowHeight)) {
        throw 'invalid number for maxRowHeight';
      }

      if (newMaxRowHeight < rowHeight) {
        newMaxRowHeight = rowHeight;
      }

      return newMaxRowHeight;
    }

    checkSettings() {
      this.checkSizeRangesSuffixes();

      this.checkOrConvertNumber(this.settings, 'rowHeight');
      this.checkOrConvertNumber(this.settings, 'margins');
      this.checkOrConvertNumber(this.settings, 'border');
      this.checkOrConvertNumber(this.settings, 'maxRowsCount');

      const lastRowModes = ['justify', 'nojustify', 'left', 'center', 'right', 'hide'];
      if (lastRowModes.indexOf(this.settings.lastRow) === -1) {
        throw 'lastRow must be one of: ' + lastRowModes.join(', ');
      }

      this.checkOrConvertNumber(this.settings, 'justifyThreshold');
      if (this.settings.justifyThreshold < 0 || this.settings.justifyThreshold > 1) {
        throw 'justifyThreshold must be in the interval [0,1]';
      }

      if (!utils.isBoolean(this.settings.cssAnimation)) {
        throw 'cssAnimation must be a boolean';
      }

      if (!utils.isBoolean(this.settings.captions)) {
        throw 'captions must be a boolean';
      }

      this.checkOrConvertNumber(this.settings.captionSettings, 'animationDuration');
      this.checkOrConvertNumber(this.settings.captionSettings, 'visibleOpacity');

      if (this.settings.captionSettings.visibleOpacity < 0 ||
          this.settings.captionSettings.visibleOpacity > 1) {
        throw 'captionSettings.visibleOpacity must be in the interval [0, 1]';
      }

      this.checkOrConvertNumber(this.settings.captionSettings, 'nonVisibleOpacity');
      if (this.settings.captionSettings.nonVisibleOpacity < 0 ||
          this.settings.captionSettings.nonVisibleOpacity > 1) {
        throw 'captionSettings.nonVisibleOpacity must be in the interval [0, 1]';
      }

      this.checkOrConvertNumber(this.settings, 'imagesAnimationDuration');
      this.checkOrConvertNumber(this.settings, 'refreshTime');
      this.checkOrConvertNumber(this.settings, 'refreshSensitivity');

      if (!utils.isBoolean(this.settings.randomize)) {
        throw 'randomize must be a boolean';
      }

      if (!utils.isString(this.settings.selector)) {
        throw 'selector must be a string';
      }

      if (this.settings.sort !== false && !utils.isFunction(this.settings.sort)) {
        throw 'sort must be false or a comparison function';
      }

      if (this.settings.filter !== false &&
          !utils.isFunction(this.settings.filter) &&
          !utils.isString(this.settings.filter)) {
        throw 'filter must be false, a string or a filter function';
      }
    }

    retrieveSuffixRanges() {
      const suffixRanges = Object.keys(this.settings.sizeRangeSuffixes)
        .map(key => parseInt(key, 10));
      suffixRanges.sort((a, b) => a - b);
      return suffixRanges;
    }

    updateSettings(newSettings) {
      this.settings = utils.extend({}, this.settings, newSettings);
      this.checkSettings();
      this.border = this.settings.border >= 0 ? this.settings.border : this.settings.margins;
      this.maxRowHeight = this.retrieveMaxRowHeight();
      this.suffixRanges = this.retrieveSuffixRanges();
    }

    get defaults() {
      return {
        sizeRangeSuffixes: {},
        thumbnailPath: undefined,
        rowHeight: 120,
        maxRowHeight: false,
        maxRowsCount: 0,
        margins: 1,
        border: -1,
        lastRow: 'nojustify',
        justifyThreshold: 0.90,
        waitThumbnailsLoad: true,
        captions: true,
        cssAnimation: true,
        imagesAnimationDuration: 500,
        captionSettings: {
          animationDuration: 500,
          visibleOpacity: 0.7,
          nonVisibleOpacity: 0.0
        },
        rel: null,
        target: null,
        extension: /\.[^.\\/]+$/,
        refreshTime: 200,
        refreshSensitivity: 0,
        randomize: false,
        rtl: false,
        sort: false,
        filter: false,
        selector: 'a',
        imgSelector: '> img, > a > img, > svg, > a > svg',
        triggerEvent: function(event) {
          utils.trigger(this.gallery, event);
        }
      };
    }
  }

  // API function to initialize galleries
  function justifiedGallery(selector, arg) {
    const galleries = typeof selector === 'string'
      ? document.querySelectorAll(selector)
      : (selector instanceof NodeList || Array.isArray(selector))
        ? selector
        : [selector];

    Array.from(galleries).forEach((gallery, index) => {
      utils.addClass(gallery, 'justified-gallery');

      let controller = gallery._jgController;

      if (typeof controller === 'undefined') {
        if (typeof arg !== 'undefined' && arg !== null && !utils.isObject(arg)) {
          if (arg === 'destroy') return;
          throw 'The argument must be an object';
        }
        controller = new JustifiedGallery(gallery, arg);
        gallery._jgController = controller;
      } else if (arg === 'norewind') {
        // Don't rewind
      } else if (arg === 'destroy') {
        controller.destroy();
        delete gallery._jgController;
        return;
      } else {
        controller.updateSettings(arg);
        controller.rewind();
      }

      if (!controller.updateEntries(arg === 'norewind')) return;
      controller.init();
    });

    return galleries;
  }

  // Export
  return justifiedGallery;
}));

// If in browser and not using modules, make it globally available
if (typeof window !== 'undefined' && !window.justifiedGallery) {
  window.justifiedGallery = window.JustifiedGallery;
}