var TW = chrome.extension.getBackgroundPage().TW;

TW.optionsTab = {};

/**
 * Initialization for options tab.
 * @param context
 *  Optionally used to limit jQueries
 */
TW.optionsTab.init = function(context) {

  function onBlurInput() {
    var key = this.id;
    TW.optionsTab.saveOption(key, $(this).val());
  }

  function onChangeCheckBox() {
    var key = this.id;
    if ($(this).attr('checked')) {
      TW.optionsTab.saveOption(key, $(this).val());
    } else {
      TW.optionsTab.saveOption(key, false);
    }
  }

  $('#minutesInactive').keyup(_.debounce(onBlurInput, 200));
  $('#minTabs').keyup(_.debounce(onBlurInput, 200));
  $('#purgeClosedTabs').change(onChangeCheckBox);
  $('#showBadgeCount').change(onChangeCheckBox);
  $('#enableSync').change(onChangeCheckBox);

  TW.optionsTab.loadOptions();
}


TW.optionsTab.saveOption = function (key, value) {

  var errors = new Array();
  $('#status').html();

  try {
    TW.settings.set(key, value);
  } catch (err) {
    errors.push(err);
  }


  $('#status').removeClass();
  $('#status').css('visibility', 'visible');
  $('#status').css('opacity', '100');

  if (errors.length == 0) {
    $('#status').html('Saving...');
    $('#status').addClass('alert-success').addClass('alert');
    $('#status').delay(50).animate({opacity:0});
  } else {
    var $errorList = $('<ul></ul>');
    for (var i=0; i< errors.length; i++) {
      $errorList.append('<li>' + errors[i].message + '</li>');
    }
    $('#status').append($errorList).addClass('alert-error').addClass('alert');
  }
  return false;
}

TW.optionsTab.loadOptions = function () {
  $('#minutesInactive').val(TW.settings.get('minutesInactive'));
  $('#minTabs').val(TW.settings.get('minTabs'));
  if (TW.settings.get('purgeClosedTabs')) {
    $('#purgeClosedTabs').attr('checked', true);
  }
  if (TW.settings.get('showBadgeCount')) {
    $('#showBadgeCount').attr('checked', true);
  }
  if (TW.settings.enableSync) {
    $('#enableSync').attr('checked', true);
  }

  $('#whitelist').addOption = function(key, val) {
    this.append(
    $('<option />')
    .value(val)
    .text(key)
  );
  }

  var whitelist = TW.settings.get('whitelist');
  TW.optionsTab.buildWLTable(whitelist);

  $('#addToWL').click(function() {
    whitelist.push($('#wl-add').val());
    $('#wl-add').val('');
    TW.optionsTab.saveOption('whitelist', whitelist);
    TW.optionsTab.buildWLTable(whitelist);
    return false;
  });

}

TW.optionsTab.buildWLTable = function(whitelist) {
  var $wlTable = $('table#whitelist tbody');
  $wlTable.html('');
  for (var i=0; i < whitelist.length; i++) {
    $tr = $('<tr></tr>');
    $urlTd = $('<td></td>').text(whitelist[i]);
    $deleteLink = $('<a class="deleteLink" href="#">Remove</a>')
    .click(function() {
      whitelist.remove(whitelist.indexOf($(this).data('pattern')));
      TW.optionsTab.saveOption('whitelist', whitelist);
      TW.optionsTab.buildWLTable(whitelist);
    })
    .data('pattern', whitelist[i]);

    $tr.append($urlTd);
    $tr.append($('<td></td>').append($deleteLink));
    $wlTable.append($tr);
  }
}

// Active Tab
// @todo: rename this to lock tab, that's what it's for.;
TW.activeTab = {};

TW.activeTab.init = function(context) {
  chrome.windows.getCurrent(null, function(window) {
    chrome.tabs.query({ windowId: window.id, pinned: false },
                     function(tabs) { TW.activeTab.buildTabLockTable(tabs); });
  });
}

TW.activeTab.saveLock = function(tabId) {
  TW.TabManager.lockTab(tabId);
}

TW.activeTab.removeLock = function(tabId) {
  TW.TabManager.unlockTab(tabId);
}


/**
 * @param tabs
 * @return {Boolean}
 */
TW.activeTab.buildTabLockTable = function (tabs) {
  var self = this;

  var tabNum = tabs.length;
  var $tbody = $('#activeTabs tbody');
  $tbody.html('');

  function secondsToMinutes(seconds) {
    if (seconds > 0) {
      var s = seconds % 60;
      s = s >= 10 ? String(s) : "0" + String(s);
      return String(Math.floor(seconds / 60)) + ":" + s;
    } else {
      return "0:00";
    }
  }

  for (var i = 0; i < tabNum; i++) {

    var tabIsLocked = TW.TabManager.isLocked(tabs[i].id);
    var tabIsWhitelisted = TW.TabManager.isWhitelisted(tabs[i].url);

    // Create a new row.
    var $tr = $('<tr></tr>');

    // Checkbox to lock it.
    //@todo: put the handler in its own function
    var $lock_box = $('<input />')
    .attr('type', 'checkbox')
    .attr('id', "cb" + tabs[i].id)
    .attr('value', tabs[i].id)
    .attr('checked', tabIsLocked || tabIsWhitelisted)
    .attr('disabled', tabIsWhitelisted)
    .click(function () {
      if (this.checked) {
        self.saveLock(parseInt(this.value));
      } else {
        self.removeLock(parseInt(this.value));
      }
    });
    $tr.append($('<td></td>').append($lock_box));

    // Image cell.
    var $img_td = $('<td></td>');
    if (tabs[i].favIconUrl != null && tabs[i].favIconUrl != undefined && tabs[i].favIconUrl.length > 0) {
      // We have an image to show.
      var $img_icon = $('<img />')
      .attr('class', 'favicon')
      .attr('src', tabs[i].favIconUrl)
      $img_td.append($img_icon);
    } else {
      $img_td.text('-');
    }

    $tr.append($img_td);

    // Page title.
    $tr.append($('<td><span class="tabTitle">' + tabs[i].title.shorten(70) + '</span><br/><span class="tabUrl">' + tabs[i].url.shorten(70) + '</td>'));

    if (!tabIsLocked && !tabIsWhitelisted) {
      var cutOff = new Date().getTime() - TW.settings.get('stayOpen');

      var lastModified = TW.TabManager.openTabs[tabs[i].id].time;
      var timeLeft = -1 * (Math.round((cutOff - lastModified) / 1000)).toString();
      if (TW.TabManager.paused) {
        $timer = $('<td class="time-left">paused</td>');
      } else {
        $timer = $('<td class="time-left">' + secondsToMinutes(timeLeft) + '</td>');
      }

      $timer.data('countdown', timeLeft);
      $tr.append($timer);
    } else {
      $tr.append($('<td></td>'));
    }
    // Append the row.
    $tbody.append($tr);
  }

  updateCountdown = function() {
      $('.time-left').each(function() {
        var t = null;
        var myElem = $(this);
        if (TW.TabManager.paused) {
          myElem.html('paused');
        } else {
          t = myElem.data('countdown') - 1;
          myElem.html(secondsToMinutes(t));
          myElem.data('countdown', t);
        }
      });
    }

    setInterval(updateCountdown, 1000);

  return true;
}

TW.corralTab = {};

TW.corralTab.init = function(context) {
  var self = this;

  // Setup interface elements
  $('#autocloseMessage').hide();
  $('.clearCorralMessage').hide();
  // @todo: use context to select table.
  TW.TabManager.searchTabs(function(closedTabs) {
    if ( closedTabs.length == 0 ) {
      // If we have no saved closed tabs, show the help text
      $('#autocloseMessage').show();
    } else {
      $('.clearCorralMessage').show();
    }
    return self.buildTable(closedTabs);
  });
  $('.clearCorralLink').click(function() {
    TW.TabManager.closedTabs.clear();
    TW.TabManager.updateClosedCount();
    TW.corralTab.init();
    return;
  });

  if(location.search !== "?foo") {
    location.search = "?foo";
    throw new Error;  // load everything on the next page;
    // stop execution on this page
  }

  $('.corral-search').keyup(_.debounce(
  function() {
    var keyword = $(this).val();
    TW.TabManager.searchTabs(self.buildTable, [TW.TabManager.filters.keyword(keyword)]);
  }, 200));

  $('.corral-search').delay(1000).focus();
}

TW.corralTab.buildTable = function(closedTabs) {

  /**
   * @todo: add this back in
   *
   * function openExtTab() {
   chrome.tabs.create({'url':'chrome://extensions/'});
   }

   function openNewTab() {
   chrome.tabs.create({'url':'chrome://newtab/'});
   }
   */

  // Clear out the table.
  var $tbody = $('#corralTable tbody');
  $tbody.html('');

  var now = new Date().getTime();
  separations = []
  separations.push([now - (1000 * 60 * 30), 'in the last 1/2 hour']);
  separations.push([now - (1000 * 60 * 60), 'in the last hour']);
  separations.push([now - (1000 * 60 * 60 * 2),'in the last 2 hours']);
  separations.push([now - (1000 * 60 * 60 * 24),'in the last day']);
  separations.push([0, 'more than a day ago']);

  function getGroup(time) {
    var limit, text, i;
    for (i=0; i < separations.length; i++) {
      limit = separations[i][0]
      text = separations[i][1]
      if (limit < time) {
        return text;
      }
    }
  }

  function createGroupRow(timeGroup, $tbody) {
    var $tr = $('<tr class="info"></tr>');
    $button = $('<button class="btn btn-mini btn-primary" style="float:right;">restore all</button>').click(function() {
      $('tr[data-group="' + timeGroup + '"]').each(function() {
        $('a', this).click();
      });
    });
    $td = $('<td colspan=3 style="padding-left:20px"> closed ' + timeGroup + '</td>').append($button);
    $tr.append($td);
    $tbody.append($tr);
  }

  function createTabRow(tab, group, $tbody) {
    // Create a new row.
    var $tr = $('<tr></tr>').attr('data-group', group);

    // Image cell.
    var $img_td = $('<td></td>');
    if (tab.favIconUrl != null && tab.favIconUrl != undefined && tab.favIconUrl.length > 0) {
      // We have an image to show.
      var $img_icon = $('<img />')
      .attr('class', 'favicon')
      .attr('src', tab.favIconUrl)
      $img_td.append($img_icon);
    } else {
      $img_td.text('-');
    }

    $tr.append($img_td);

    // Page title.

    // @todo: Add this logic back in:
    //    if ( urls[i] == "chrome://newtab/") {
    //      a_title.href = "javascript:openNewTab();";
    //    } else  if ( urls[i] == "chrome://extensions/") {
    //      a_title.href = "javascript:openExtTab();";
    //    } else {
    //      a_title.href = urls[i];
    //    }

    var $link = $('<a>').attr('target', '_blank').attr('data-tabid', tab.id).attr('href', tab.url);
    $link.text(tab.title.shorten(70));

    // Create a new tab when clicked in the background
    // Remove from the closedTabs list.
    $link.click(function() {
      chrome.tabs.create({active:false, url: $(this).attr('href')});
      TW.TabManager.closedTabs.removeTab($(this).data('tabid'));
      $(this).parent().parent().remove();
      return false;
    });

    var $clear = $('<img />').attr('class', 'clearButton').attr('src', 'img/clear.png').hide();
    $clear.click(function() {
      TW.TabManager.closedTabs.removeTab($(this).data('tabid'));
      $(this).parent().parent().remove();
    });
    $clear.hover(function() { $clear.attr('src', 'img/clear-hover.png'); },
                function() { $clear.attr('src', 'img/clear.png'); });

    $tr.hover(function() { $clear.fadeIn(100); }, function() { $clear.fadeOut(100); });
    $tr.append($('<td></td/>').append($link).append($clear));

    // Url - not sure if we want this.
    // $tr.append($('<td>' + tab.url.shorten(70) + '</td>'));
    // time ago.
    $tr.append($('<td></td>').append($.timeago(tab.closedAt)))
    $tbody.append($tr);
  }

  /**
    * Testing code to make fake tags

    closedTabs = [];
    for (var i=0; i<20; i++) {
      now = new Date().getTime();
      x = Math.pow(2, i);
      closedTabs.push({closedAt: now-1000*1*x, title: 'foo'});
    }

  */

  var currentGroup = '';
  for ( var i = 0; i < closedTabs.length; i++) {
    var tab = closedTabs[i];

    timeGroup = getGroup(tab.closedAt);
    if (timeGroup != currentGroup) {
      createGroupRow(timeGroup, $tbody);
      currentGroup = timeGroup;
    }

    createTabRow(tab, currentGroup, $tbody);

  }
}

TW.corralTab.filterByKeyword = function() {
  var keyword = $(this).val();
}

TW.pauseButton = {};

TW.pauseButton.init = function() {
  var self = this;
  if (TW.TabManager.paused) {
    this.pause();
  } else {
    this.play();
  }
  this.elem = $('a#pauseButton');

  this.elem.click(function() {
    if (TW.TabManager.paused) {
      self.play();
      TW.TabManager.setPaused(false);
    } else {
      self.pause();
      TW.TabManager.setPaused(true);
    }
  });
}
TW.pauseButton.pause = function() {
  chrome.browserAction.setIcon({'path': 'img/icon-paused.png'});
  $('.unpaused-state', this.elem).hide();
  $('.paused-state', this.elem).show();
}

TW.pauseButton.play = function() {
  chrome.browserAction.setIcon({'path': 'img/icon.png'});
  $('.paused-state',this.elem).hide();
  $('.unpaused-state', this.elem).show();
}

$(document).ready(function() {

  // Initialize the pause button and all tabs.
  TW.pauseButton.init();
  TW.corralTab.init();
  TW.activeTab.init();
  TW.optionsTab.init();

  $('a[href="#tabCorral"]').tab('show');
});