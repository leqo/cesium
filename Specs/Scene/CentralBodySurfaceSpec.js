/*global defineSuite*/
defineSuite([
         'Scene/CentralBodySurface',
         'Specs/createContext',
         'Specs/destroyContext',
         'Specs/frameState',
         'Specs/render',
         'Scene/CentralBody',
         'Scene/EllipsoidTerrainProvider',
         'Scene/ImageryLayerCollection',
         'Scene/SingleTileImageryProvider'
     ], function(
         CentralBodySurface,
         createContext,
         destroyContext,
         frameState,
         render,
         CentralBody,
         EllipsoidTerrainProvider,
         ImageryLayerCollection,
         SingleTileImageryProvider) {
    "use strict";
    /*global jasmine,describe,xdescribe,it,xit,expect,beforeEach,afterEach,beforeAll,afterAll,spyOn,runs,waits,waitsFor*/

    function forEachRenderedTile(surface, minimumTiles, maximumTiles, callback) {
        var tileCount = 0;
        var tilesToRenderByTextureCount = surface._tilesToRenderByTextureCount;
        for (var tileSetIndex = 0, tileSetLength = tilesToRenderByTextureCount.length; tileSetIndex < tileSetLength; ++tileSetIndex) {
            var tileSet = tilesToRenderByTextureCount[tileSetIndex];
            if (typeof tileSet === 'undefined' || tileSet.length === 0) {
                continue;
            }

            for (var i = 0, len = tileSet.length; i < len; i++) {
                var tile = tileSet[i];
                ++tileCount;
                callback(tile);
            }
        }

        if (typeof minimumTiles !== 'undefined') {
            expect(tileCount).not.toBeLessThan(minimumTiles);
        }

        if (typeof maximumTiles !== 'undefined') {
            expect(tileCount).not.toBeGreaterThan(maximumTiles);
        }
    }

    /**
     * Repeatedly calls update until the load queue is empty.  You must wrap any code to follow
     * this in a "runs" function.
     */
    function updateUntilDone(cb) {
        // update until the load queue is empty.
        waitsFor(function() {
            var commandLists = [];
            cb.update(context, frameState, commandLists);
            return typeof cb._surface._tileLoadQueue.head === 'undefined';
        });
    }

    var context;
    var cb;
    var surface;

    beforeAll(function() {
        context = createContext();
    });

    afterAll(function() {
        destroyContext(context);
    });

    beforeEach(function() {
        cb = new CentralBody();
        surface = cb._surface;
    });

    afterEach(function() {
        cb.destroy();
    });

    describe('construction', function() {
        it('throws if an terrain provider is not provided', function() {
            var surface;
            function constructWithoutTerrainProvider() {
                surface = new CentralBodySurface({
                    imageryLayerCollection : new ImageryLayerCollection()
                });
            }
            expect(constructWithoutTerrainProvider).toThrow();
            expect(surface).toBeUndefined();
        });

        it('throws if a ImageryLayerCollection is not provided', function() {
            var surface;
            function constructWithoutImageryLayerCollection() {
                surface = new CentralBodySurface({
                    terrainProvider : new EllipsoidTerrainProvider()
                });
            }
            expect(constructWithoutImageryLayerCollection).toThrow();
            expect(surface).toBeUndefined();
        });
    });

    describe('layer updating', function() {
        it('removing a layer removes it from all tiles', function() {
            var layerCollection = cb.getImageryLayers();
            expect(surface).not.toBeUndefined();

            layerCollection.removeAll();
            var layer = layerCollection.addImageryProvider(new SingleTileImageryProvider({url : 'Data/Images/Red16x16.png'}));

            updateUntilDone(cb);

            runs(function() {
                // All tiles should have one or more associated images.
                forEachRenderedTile(surface, 1, undefined, function(tile) {
                    expect(tile.imagery.length).toBeGreaterThan(0);
                    for (var i = 0; i < tile.imagery.length; ++i) {
                        expect(tile.imagery[i].imagery.imageryLayer).toEqual(layer);
                    }
                });

                layerCollection.remove(layer);

                // All associated images should be gone.
                forEachRenderedTile(surface, 1, undefined, function(tile) {
                    expect(tile.imagery.length).toEqual(0);
                });
            });
        });

        it('adding a layer adds it to all tiles after update', function() {
            var layerCollection = cb.getImageryLayers();
            expect(surface).not.toBeUndefined();

            layerCollection.removeAll();
            layerCollection.addImageryProvider(new SingleTileImageryProvider({url : 'Data/Images/Red16x16.png'}));

            updateUntilDone(cb);

            var layer2;

            runs(function() {
                // Add another layer
                layer2 = layerCollection.addImageryProvider(new SingleTileImageryProvider({url : 'Data/Images/Green4x4.png'}));
            });

            updateUntilDone(cb);

            runs(function() {
                // All tiles should have one or more associated images.
                forEachRenderedTile(surface, 1, undefined, function(tile) {
                    expect(tile.imagery.length).toBeGreaterThan(0);
                    var hasImageFromLayer2 = false;
                    for (var i = 0; i < tile.imagery.length; ++i) {
                        if (tile.imagery[i].imagery.imageryLayer === layer2) {
                            hasImageFromLayer2 = true;
                        }
                    }
                    expect(hasImageFromLayer2).toEqual(true);
                });
            });
        });

        it('moving a layer moves the corresponding TileImagery instances on every tile', function() {
            var layerCollection = cb.getImageryLayers();
            expect(surface).not.toBeUndefined();

            layerCollection.removeAll();
            var layer1 = layerCollection.addImageryProvider(new SingleTileImageryProvider({url : 'Data/Images/Red16x16.png'}));
            var layer2 = layerCollection.addImageryProvider(new SingleTileImageryProvider({url : 'Data/Images/Green4x4.png'}));

            updateUntilDone(cb);

            runs(function() {
                forEachRenderedTile(surface, 1, undefined, function(tile) {
                    expect(tile.imagery.length).toBeGreaterThan(0);
                    var indexOfFirstLayer1 = tile.imagery.length;
                    var indexOfLastLayer1 = -1;
                    var indexOfFirstLayer2 = tile.imagery.length;
                    for (var i = 0; i < tile.imagery.length; ++i) {
                        if (tile.imagery[i].imagery.imageryLayer === layer1) {
                            indexOfFirstLayer1 = Math.min(indexOfFirstLayer1, i);
                            indexOfLastLayer1 = i;
                        } else {
                            expect(tile.imagery[i].imagery.imageryLayer).toEqual(layer2);
                            indexOfFirstLayer2 = Math.min(indexOfFirstLayer2, i);
                        }
                    }
                    expect(indexOfFirstLayer1).toBeLessThan(indexOfFirstLayer2);
                    expect(indexOfLastLayer1).toBeLessThan(indexOfFirstLayer2);
                });

                layerCollection.raiseToTop(layer1);

                forEachRenderedTile(surface, 1, undefined, function(tile) {
                    expect(tile.imagery.length).toBeGreaterThan(0);
                    var indexOfFirstLayer2 = tile.imagery.length;
                    var indexOfLastLayer2 = -1;
                    var indexOfFirstLayer1 = tile.imagery.length;
                    for (var i = 0; i < tile.imagery.length; ++i) {
                        if (tile.imagery[i].imagery.imageryLayer === layer2) {
                            indexOfFirstLayer2 = Math.min(indexOfFirstLayer2, i);
                            indexOfLastLayer2 = i;
                        } else {
                            expect(tile.imagery[i].imagery.imageryLayer).toEqual(layer1);
                            indexOfFirstLayer1 = Math.min(indexOfFirstLayer1, i);
                        }
                    }
                    expect(indexOfFirstLayer2).toBeLessThan(indexOfFirstLayer1);
                    expect(indexOfLastLayer2).toBeLessThan(indexOfFirstLayer1);
                });
            });
        });
    });
});
