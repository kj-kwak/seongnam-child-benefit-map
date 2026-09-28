// Minimal SDK contract for deterministic component integration tests.
(() => {
  const listeners = new WeakMap();
  const emit = (target, name) =>
    queueMicrotask(() => {
      for (const fn of listeners.get(target)?.get(name) || []) fn();
    });
  class LatLng {
    constructor(lat, lng) {
      this.lat = lat;
      this.lng = lng;
    }
    getLat() {
      return this.lat;
    }
    getLng() {
      return this.lng;
    }
    equals(other) {
      return this.lat === other.lat && this.lng === other.lng;
    }
  }
  class Map {
    constructor(element, options) {
      this.element = element;
      this.center = options.center;
      this.level = options.level;
      element.dataset.sdkMap = "ready";
    }
    getCenter() {
      return this.center;
    }
    getLevel() {
      return this.level;
    }
    getBounds() {
      return {
        getSouthWest: () => new LatLng(37.39, 127.1),
        getNorthEast: () => new LatLng(37.45, 127.15),
      };
    }
    setCenter(center) {
      this.center = center;
      emit(this, "idle");
    }
    panTo(center) {
      this.setCenter(center);
    }
    setLevel(level) {
      if (level !== this.level) {
        this.level = level;
        emit(this, "idle");
      }
    }
    relayout() {}
  }
  class CustomOverlay {
    constructor(options) {
      this.content = options.content;
      this.wrapper = document.createElement("div");
      this.wrapper.appendChild(this.content);
    }
    getContent() {
      return this.content;
    }
    setMap(map) {
      if (map) map.element.appendChild(this.wrapper);
      else this.wrapper.remove();
    }
    setPosition() {}
    setZIndex() {}
  }
  window.kakao = {
    maps: {
      LatLng,
      Coords: class {},
      Map,
      CustomOverlay,
      load: (fn) => queueMicrotask(fn),
      event: {
        addListener(target, name, fn) {
          if (!listeners.has(target))
            listeners.set(target, new globalThis.Map());
          const events = listeners.get(target);
          if (!events.has(name)) events.set(name, new Set());
          events.get(name).add(fn);
        },
        removeListener(target, name, fn) {
          listeners.get(target)?.get(name)?.delete(fn);
        },
      },
    },
  };
})();
