/*
   Copyright 2016 Yuki KAN

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
/// <reference path="../../typings/index.d.ts" />
"use strict";

import * as stream from "stream";
import * as fs from "fs";
import * as sift from "sift";
import * as log from "./log";
import _ from "./_";
import db from "./db";
import queue from "./queue";
import ServiceItem from "./ServiceItem";
import ProgramItem from "./ProgramItem";

export default class Program {

    private _items: ProgramItem[] = [];
    private _saveTimerId: NodeJS.Timer;
    private _programGCInterval = _.config.server.programGCInterval || 1000 * 60 * 15;

    constructor() {

        _.program = this;

        this._load();

        setTimeout(this._gc.bind(this), this._programGCInterval);
    }

    get items(): ProgramItem[] {
        return this._items;
    }

    add(item: ProgramItem): void {

        if (this.get(item.id) === null) {
            this._items.push(item);

            this.save();
        }
    }

    get(id: number): ProgramItem {

        for (let i = 0, l = this._items.length; i < l; i++) {
            if (this._items[i].id === id) {
                return this._items[i];
            }
        }

        return null;
    }

    remove(item: ProgramItem): void {

        const index = this._items.indexOf(item);

        if (index !== -1) {
            this._items.splice(index, 1);

            this.save();
        }
    }

    exists(id: number): boolean {
        return this.get(id) !== null;
    }

    findByQuery(query: Object): ProgramItem[] {
        return sift(query, this._items);
    }

    findByServiceId(serviceId: number): ProgramItem[] {

        const items = [];

        for (let i = 0, l = this._items.length; i < l; i++) {
            if (this._items[i].data.serviceId === serviceId) {
                items.push(this._items[i]);
            }
        }

        return items;
    }

    findConflicts(networkId: number, serviceId: number, start: number, end: number): ProgramItem[] {

        const items = [];

        for (let i = 0, l = this._items.length; i < l; i++) {
            const item = this._items[i];
            if (
                item.data.networkId === networkId &&
                item.data.serviceId === serviceId &&
                item.data.startAt >= start &&
                item.data.startAt < end
            ) {
                items.push(item);
            }
        }

        return items;
    }

    save(): void {
        clearTimeout(this._saveTimerId);
        this._saveTimerId = setTimeout(() => this._save(), 3000);
    }

    private _load(): void {

        log.debug("loading programs...");

        const now = Date.now();
        let dropped = false;

        db.loadPrograms().forEach(program => {

            if (typeof program.networkId === "undefined") {
                dropped = true;
                return;
            }
            if (now > (program.startAt + program.duration)) {
                dropped = true;
                return;
            }

            new ProgramItem(program, true);
        });

        if (dropped) {
            this.save();
        }
    }

    private _save(): void {

        log.debug("saving programs...");

        db.savePrograms(
            this._items.map(program => program.data)
        );
    }

    private _gc(): void {

        log.debug("Program GC has queued");

        queue.add(async () => {

            const now = Date.now();
            let count = 0;

            this._items.forEach(program => {
                if (now > (program.data.startAt + program.data.duration)) {
                    ++count;
                    program.remove();
                }
            });

            setTimeout(this._gc.bind(this), this._programGCInterval);

            log.info("Program GC has finished and removed %d programs", count);
        });
    }

    static getProgramId(networkId: number, serviceId: number, eventId: number): number {
        return parseInt(networkId + (serviceId / 100000).toFixed(5).slice(2) + (eventId / 100000).toFixed(5).slice(2), 10);
    }

    static add(item: ProgramItem): void {
        return _.program.add(item);
    }

    static get(id: number): ProgramItem {
        return _.program.get(id);
    }

    static remove(item: ProgramItem): void {
        return _.program.remove(item);
    }

    static exists(id: number): boolean {
        return _.program.exists(id);
    }

    static findByQuery(query: Object): ProgramItem[] {
        return _.program.findByQuery(query);
    }

    static findByServiceId(serviceId: number): ProgramItem[] {
        return _.program.findByServiceId(serviceId);
    }

    static all(): ProgramItem[] {
        return _.program.items;
    }

    static save(): void {
        return _.program.save();
    }
}