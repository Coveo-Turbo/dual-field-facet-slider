// Version 1.0.2

import { max as d3max, select as d3select } from 'd3';
import { scaleBand, scaleLinear } from 'd3-scale';
import * as Globalize from 'globalize';
import { each, indexOf, map, min } from 'underscore';

import {
    Component,
    IComponentBindings,
    Initialization,
    ComponentOptions,
    FacetSlider,
    QueryEvents,
    Defer,
    SliderEvents,
    DeviceUtils,
    IPreprocessResultsEventArgs,
    $$,
    FacetSettings,
    FacetSort,
    IFacetHeaderOptions,
    IAnalyticsFacetOperatorMeta,
    analyticsActionCauseList,
    l,
} from 'coveo-search-ui';
// import { lazyComponent } from '@coveops/turbo-core';

export interface IDualFieldFacetSliderOptions {
    fieldMin: string;
    fieldMax: string;
    title?: string;
    id?: string;
    rangeSlider?: boolean;
    delay?: number;
    valueCaption?: any;
    rounded?: number;
    start?: number;
    end?: number;
}

export interface IStartSlideEventArgs {
    slider: Slider;
    button: SliderButton;
}

export interface IDuringSlideEventArgs {
    slider: Slider;
    button: SliderButton;
}

export interface IEndSlideEventArgs {
    slider: Slider;
    button: SliderButton;
}

export interface ISliderGraphData {
    start: any;
    y: number;
    end: any;
    isDate?: boolean;
}

export interface ISliderOptions {
    start?: any;
    end?: any;
    excludeOuterBounds?: boolean;
    steps?: number;
    getSteps?: (start: number, end: number) => number[];
    rangeSlider?: boolean;
    displayAsValue?: {
        enable?: boolean;
        unitSign?: string;
        separator?: string;
    };
    displayAsPercent?: {
        enable?: boolean;
        separator?: string;
    };
    valueCaption?: (values: number[]) => string;
    percentCaption?: (percent: number[]) => string;
    dateFormat?: string;
    document?: Document;
    graph?: {
        steps?: number;
        animationDuration?: number;
        margin?: {
            top?: number;
            bottom?: number;
            left?: number;
            right?: number;
        };
    };
    dateField?: boolean;
    rounded?: number;
}

export const MAX_NUMBER_OF_STEPS = 100;

// @lazyComponent
export class DualFieldFacetSlider extends Component {
    static ID = 'DualFieldFacetSlider';

    private cleanedMinField: string;
    private cleanedMaxField: string;

    public startOfSlider: number;
    public endOfSlider: number;
    public initialStartOfSlider: number;
    public initialEndOfSlider: number;

    public onResize: EventListener;
    private isEmpty = false;

    public facetHeader: FacetHeader;

    static options: IDualFieldFacetSliderOptions = {
        fieldMin: ComponentOptions.buildStringOption(),
        fieldMax: ComponentOptions.buildStringOption(),
        title: ComponentOptions.buildStringOption({ defaultValue: "FacetSliderDynamicRange" }),
        id: ComponentOptions.buildStringOption({ defaultValue: "FacetSliderDynamicRange" }),
        rangeSlider: ComponentOptions.buildBooleanOption({ defaultValue: true }),
        delay: ComponentOptions.buildNumberOption({ defaultValue: 200 }),
        rounded: ComponentOptions.buildNumberOption({ defaultValue: 0 }),
        valueCaption: ComponentOptions.buildCustomOption<(values: number[]) => string>(() => {
            return null;
        })
    };

    public HiddenMinSlider: FacetSlider;
    public HiddenMaxSlider: FacetSlider;
    public dualFieldFacetSlider: FacetSlider;


    constructor(public element: HTMLElement, public options: IDualFieldFacetSliderOptions, public bindings: IComponentBindings, private slider?: Slider) {
        super(element, DualFieldFacetSlider.ID, bindings);
        this.options = ComponentOptions.initComponentOptions(element, DualFieldFacetSlider, options);

        this.cleanedMinField = this.options.fieldMin.replace('@', '');
        this.cleanedMaxField = this.options.fieldMax.replace('@', '');

        // ResponsiveFacetSlider.init(this.root, this, this.options);

        this.bind.onRootElement(QueryEvents.preprocessResults, (args: IPreprocessResultsEventArgs) => this.handlePreprocessResults(args));

        Coveo.load('FacetSlider').then(
            (arg) => {
                Coveo.FacetSlider = arg as any;
                this.buildDualSlider();
            })
    }

    public buildDualSlider() {
        this.element.classList.add('CoveoFacetSlider');

        this.buildHeader();
        this.buildSlider();

        this.buildHiddenMinMaxSlider();

    }

    public buildHeader() {
        this.facetHeader = new FacetHeader({
            field: <string>this.options.fieldMin,
            facetElement: this.element,
            title: this.options.title,
            enableClearElement: true,
            enableCollapseElement: true,
            // facetSlider: this.slider
        });

        this.element.append(this.facetHeader.build());
    }

    private buildSlider() {
        const sliderContainer = $$('div', { className: 'coveo-slider-container' }).el;

        const sliderDiv = $$('div').el;

        this.options.start = 0;
        this.options.end = 15000;

        this.slider = this.slider
            ? this.slider
            : new Slider(sliderDiv, { ...this.options, ...{ dateField: null } } as ISliderOptions, this.root);
        $$(sliderDiv).on(SliderEvents.endSlide, (e: MouseEvent, args: IEndSlideEventArgs) => {
            this.handleEndSlide(args);
        });
        $$(sliderDiv).on(SliderEvents.duringSlide, (e: MouseEvent, args: IDuringSlideEventArgs) => {
            this.handleDuringSlide(args);
        });

        sliderContainer.appendChild(sliderDiv);
        this.element.appendChild(sliderContainer);
        this.updateAppearanceDependingOnState();
    }

    private handleEndSlide(args: IEndSlideEventArgs) {
        const values = args.slider.getValues();
        this.startOfSlider = values[0];
        this.endOfSlider = values[1];
        // if (this.updateQueryState(values)) {
        //   this.updateAppearanceDependingOnState();
        //   this.usageAnalytics.logSearchEvent<IAnalyticsFacetSliderChangeMeta>(analyticsActionCauseList.facetRangeSlider, {
        //     facetId: this.options.id,
        //     facetField: this.options.field.toString(),
        //     facetRangeStart: this.startOfSlider.toString(),
        //     facetRangeEnd: this.endOfSlider.toString()
        //   });
        //   this.queryController.executeQuery();
        // }
    }

    private handleDuringSlide(args: IDuringSlideEventArgs) {
        const values = args.slider.getValues();
        this.startOfSlider = values[0];
        this.endOfSlider = values[1];
        this.slider.setValues([this.startOfSlider, this.endOfSlider]);
        this.updateAppearanceDependingOnState(true);
    }

    public isActive(): boolean {
        return (
            !isNaN(this.startOfSlider) &&
            !isNaN(this.endOfSlider) &&
            !isNaN(this.initialStartOfSlider) &&
            !isNaN(this.initialEndOfSlider) &&
            (this.startOfSlider != this.initialStartOfSlider || this.endOfSlider != this.initialEndOfSlider)
        );
    }

    private updateAppearanceDependingOnState(sliding = false) {
        // Defer the visual update so that we can execute it after the current call stack has resolved.
        // Since this component is closely linked to DOM size calculation (width), this allows to cover some corner cases
        // where the component would be visually hidden, leading to incorrect width calculation.
        // For example, first query placeholder animation hiding the component, or switching between different tabs would affect the calculation otherwise.
        Defer.defer(() => {
            if (this.isEmpty && !this.isActive() && !sliding) {
                $$(this.element).addClass('coveo-disabled-empty');
            } else {
                $$(this.element).removeClass('coveo-disabled-empty');
                $$(this.facetHeader.eraserElement).toggle(this.isActive());
            }
            if (!this.isActive() && !sliding) {
                $$(this.element).addClass('coveo-disabled');
            } else {
                $$(this.element).removeClass('coveo-disabled');
            }

            if (this.isActive() && this.slider) {
                this.slider.onMoving();
            }
        });
    }

    public buildHiddenMinMaxSlider() {
        const elem = $$('div');
        let optionsMin = {
            id: 'Min'+this.cleanedMinField,
            title: 'Min'+this.cleanedMinField,
            field: this.options.fieldMin,
            start: 0,
            end: 15000,
            rangeSlider: true
        }
        this.HiddenMinSlider = new Coveo.FacetSlider(elem.el, optionsMin, this.bindings);
        this.element.append(this.HiddenMinSlider.element);

        const elem2 = $$('div');
        let optionsMax = {
            id: 'Max'+this.cleanedMaxField,
            title: 'Max'+this.cleanedMaxField,
            field: this.options.fieldMax,
            start: 0,
            end: 15000,
            rangeSlider: true
        }
        this.HiddenMaxSlider = new Coveo.FacetSlider(elem2.el, optionsMax, this.bindings);
        this.element.append(this.HiddenMaxSlider.element);
    }

    private handlePreprocessResults(args: IPreprocessResultsEventArgs) {

        // let currentMin = _.min(args.results.results, (item) => { return item.raw[this.cleanedField]; }).raw[this.cleanedField];
        // let currentMax = _.max(args.results.results, (item) => { return item.raw[this.cleanedField]; }).raw[this.cleanedField];
        let itemMin = _.min(args.results.results, (item) => { return item.raw[this.cleanedMinField]; });
        let itemMax = _.max(args.results.results, (item) => { return item.raw[this.cleanedMaxField]; });

        let currentMin = itemMin.raw[this.cleanedMinField];
        let currentMax = itemMax.raw[this.cleanedMaxField];

        // debugger

        // currentMin = itemMin == Infinity ? 0 : itemMin.raw[this.cleanedField];
        // currentMax = itemMax == -Infinity ? 0 : itemMax.raw[this.cleanedField];

        // if (!this.isActive && !(currentMax == currentMin)) {
        //     // this.clearGeneratedFacet();
        // this.generateFacetDom(currentMin, currentMax);
        // }
    }

    protected generateFacetDom(min: number, max: number) {
        const elem = $$('div');
        let options = {
            id: this.options.id,
            title: this.options.title,
            field: this.options.fieldMin,
            rangeSlider: true,
            start: min,
            end: max,
            rounded: this.options.rounded,
            valueCaption: this.options.valueCaption
        }
        this.dualFieldFacetSlider = new Coveo.FacetSlider(elem.el, options, this.bindings);
        this.element.append(this.dualFieldFacetSlider.element);
        setTimeout(() => {
            this.dualFieldFacetSlider.enable()
            this.dualFieldFacetSlider.element.classList.remove('coveo-disabled-empty');
            this.dualFieldFacetSlider.element.classList.remove('coveo-disabled');
        }, this.options.delay);
    }


}

class Slider {
    public steps: number[] = [];
    public currentValues: number[];
    private sliderButton: SliderButton;
    private sliderRange: SliderRange;
    private sliderLine: SliderLine;
    private sliderCaption: SliderCaption;

    constructor(public element: HTMLElement, public options: ISliderOptions, public root: HTMLElement) {

        if (this.options.rounded == undefined) {
            this.options.rounded = 0;
        }

        if (this.options.steps || this.options.getSteps) {
            debugger
            this.buildSteps();
        }

        this.sliderLine = new SliderLine(this);
        each(this.sliderLine.build(), (e: HTMLElement) => {
            this.element.appendChild(e);
        });

        if (this.options.rangeSlider) {
            this.sliderRange = new SliderRange(this);
            each(this.sliderRange.build(), (e: HTMLElement) => {
                this.element.appendChild(e);
            });
        } else {
            this.sliderButton = new SliderButton(this, 1);
            const btnEl = this.sliderButton.build();
            $$(btnEl).addClass('coveo-no-range-button');
            this.element.appendChild(btnEl);
            this.sliderLine.setActiveWidth(this.sliderButton);
        }

        this.sliderCaption = new SliderCaption(this);
        this.element.appendChild(this.sliderCaption.build());
    }

    public onMoving() {
        if (this.options.rangeSlider) {
            this.sliderRange.setBoundary();
            this.sliderLine.setActiveWidth(this.sliderRange.firstButton, this.sliderRange.secondButton);
        } else {
            this.setButtonBoundary();
            this.sliderLine.setActiveWidth(this.sliderButton);
        }
        this.displayCaption();
    }

    public initializeState(values: number[] = [this.options.start, this.options.end]) {
        this.currentValues = values;
        if (this.options.rangeSlider) {
            this.sliderRange.initializeSliderRangeState(values);
            this.sliderLine.setActiveWidth(this.sliderRange.firstButton, this.sliderRange.secondButton);
        } else {
            if (values == undefined) {
                this.sliderButton.toEnd();
            } else {
                this.sliderButton.setValue(values[1]);
            }
            this.setButtonBoundary();
            this.sliderLine.setActiveWidth(this.sliderButton);
        }
        this.displayCaption();
    }

    public getPosition() {
        if (this.options.rangeSlider) {
            return this.sliderRange.getPosition();
        } else {
            return [0, this.sliderButton.getPosition()];
        }
    }

    public getPercentPosition() {
        if (this.options.rangeSlider) {
            return this.sliderRange.getPercentPosition();
        } else {
            return [0, this.sliderButton.getPercent()];
        }
    }

    public getValues() {
        if (this.currentValues != undefined) {
            return this.currentValues;
        } else {
            if (this.options.rangeSlider) {
                return this.sliderRange.getValue();
            } else {
                return [this.options.start, this.sliderButton.getValue()];
            }
        }
    }

    public getCaptionFromValue(values: number[]) {
        return this.sliderCaption.getCaptionFromValues(values);
    }

    public getCaption() {
        return this.sliderCaption.getCaption();
    }

    public setValues(values: number[]) {
        if (values != undefined) {
            values[0] = Math.max(values[0], this.options.start);
            values[1] = Math.min(values[1], this.options.end);
        }
        this.currentValues = values;
        if (this.options.rangeSlider) {
            this.sliderRange.setValue(values);
            this.sliderLine.setActiveWidth(this.sliderRange.firstButton, this.sliderRange.secondButton);
        } else {
            this.sliderButton.setValue(values[1]);
            this.sliderLine.setActiveWidth(this.sliderButton);
        }
        this.displayCaption();
    }

    private setButtonBoundary() {
        this.sliderButton.leftBoundary = 0;
        this.sliderButton.rightBoundary = this.element.clientWidth;
    }

    private displayCaption() {
        if (this.options.valueCaption != undefined) {
            this.sliderCaption.setFromString(this.options.valueCaption(this.getValues()));
        } else if (this.options.percentCaption != undefined) {
            this.sliderCaption.setFromString(this.options.percentCaption(this.getPercentPosition()));
        } else {
            this.sliderCaption.setAsValue();
        }
    }

    private buildSteps() {
        if (this.options.getSteps) {
            this.steps = this.options.getSteps(this.options.start, this.options.end);
        } else {
            if (this.options.steps > MAX_NUMBER_OF_STEPS) {
                //   new Logger(this).warn(`Maximum number of steps for slider is ${MAX_NUMBER_OF_STEPS} for performance reason`);
                this.options.steps = MAX_NUMBER_OF_STEPS;
            }
            const oneStep = (this.options.end - this.options.start) / Math.max(1, this.options.steps);
            if (oneStep > 0) {
                let currentStep = this.options.start;
                let currentNumberOfSteps = 0;
                while (currentStep <= this.options.end && currentNumberOfSteps <= MAX_NUMBER_OF_STEPS) {
                    this.steps.push(currentStep);
                    currentStep += oneStep;
                    currentNumberOfSteps++;
                }
            } else {
                this.steps.push(this.options.start);
                this.steps.push(this.options.end);
            }
        }
    }
}

class SliderLine {
    private backGround: HTMLElement;
    private activePart: HTMLElement;

    constructor(public slider: Slider) { }

    public build(): HTMLElement[] {
        this.backGround = $$('div', {
            className: 'coveo-slider-line coveo-background'
        }).el;

        this.activePart = $$('div', {
            className: 'coveo-slider-line coveo-active'
        }).el;

        return [this.backGround, this.activePart];
    }

    public setActiveWidth(buttonOne: SliderButton, buttonTwo?: SliderButton) {
        if (this.slider.options.rangeSlider) {
            const width = (buttonTwo.getPercent() - buttonOne.getPercent()) * 100;
            this.activePart.style.width = width + '%';
            this.activePart.style.left = buttonOne.getPercent() * 100 + '%';
            this.activePart.style.right = buttonTwo.getPercent() * 100 + '%';
        } else {
            const width = buttonOne.getPercent() * 100;
            this.activePart.style.width = width + '%';
        }
    }
}

class SliderButton {
    public leftBoundary: number;
    public rightBoundary: number;
    public element: HTMLElement;
    private currentPos: number;
    private startPositionX: number;
    private isMouseDown: boolean;
    private lastElementLeft: number;
    private origUserSelect: string;
    private origCursor: string;
    private origZIndex: string;

    private eventMouseDown = DeviceUtils.isMobileDevice() ? 'touchstart' : 'mousedown';
    private eventMouseMove = DeviceUtils.isMobileDevice() ? 'touchmove' : 'mousemove';
    private eventMouseUp = DeviceUtils.isMobileDevice() ? 'touchend' : 'mouseup';

    constructor(public slider: Slider, private which: number) { }

    public build() {
        this.element = $$('div', {
            className: 'coveo-slider-button'
        }).el;

        this.bindEvents();
        this.element['CoveoSliderButton'] = this;
        return this.element;
    }

    public toBeginning() {
        this.element.style.left = '0%';
    }

    public toEnd() {
        this.element.style.left = '100%';
    }

    public setValue(value: number) {
        const percent = this.fromValueToPercent(value);
        this.element.style.left = Math.round(percent * 100) + '%';
    }

    public getPosition() {
        const left = this.element.style.left;
        if (left.indexOf('%') != -1) {
            return (parseFloat(left) / 100) * this.slider.element.clientWidth;
        } else {
            return parseFloat(left);
        }
    }

    public getPercent(position: number = this.getPosition()) {
        if (this.slider.element.clientWidth == 0) {
            return 0;
        }
        return +(position / this.slider.element.clientWidth).toFixed(2);
    }

    public getValue() {
        const value = this.getPercent() * (this.slider.options.end - this.slider.options.start) + this.slider.options.start;
        return value;
    }

    public fromValueToPercent(value: number) {
        return 1 - (this.slider.options.end - value) / (this.slider.options.end - this.slider.options.start);
    }

    public fromPositionToValue(position: number) {
        const percent = this.getPercent(position);
        return this.slider.options.start + percent * (this.slider.options.end - this.slider.options.start);
    }

    public fromValueToPosition(value: number) {
        const percent = this.fromValueToPercent(value);
        return this.slider.element.clientWidth * percent;
    }

    private bindEvents() {
        $$(this.element).on(this.eventMouseDown, (e: MouseEvent) => {
            this.handleStartSlide(e);
        });
        const doc = this.slider.options.document || document;
        doc.addEventListener(this.eventMouseMove, (e: MouseEvent) => {
            if (this.eventMouseMove == 'touchmove' && this.isMouseDown) {
                e.preventDefault();
            }
            this.handleMoving(e);
        });

        doc.addEventListener(this.eventMouseUp, () => {
            this.handleEndSlide();
        });
    }

    private getUserSelect() {
        if (document.body.style.userSelect !== undefined) {
            return 'msUserSelect';
        }
        if (document.body.style.webkitUserSelect !== undefined) {
            return 'webkitUserSelect';
        }
        if (document.body.style['MozUserSelect'] !== undefined) {
            return 'MozUserSelect';
        }
        return 'userSelect';
    }

    private handleStartSlide(e: MouseEvent) {
        const position = this.getMousePosition(e);
        this.isMouseDown = true;
        this.startPositionX = position.x;
        this.lastElementLeft = (parseInt(this.element.style.left, 10) / 100) * this.slider.element.clientWidth;
        this.origUserSelect = document.body.style[this.getUserSelect()];
        this.origCursor = document.body.style.cursor;
        document.body.style[this.getUserSelect()] = 'none';
        document.body.style.cursor = 'pointer';
        $$(this.element).addClass('coveo-active');
        $$(this.element).trigger(SliderEvents.startSlide, <IStartSlideEventArgs>{
            button: this,
            slider: this.slider
        });
        e.stopPropagation();
    }

    private handleMoving(e: MouseEvent) {
        if (this.isMouseDown) {
            this.slider.onMoving();
            this.updatePosition(e);
            this.handleButtonNearEnd();
            $$(this.element).trigger(SliderEvents.duringSlide, <IDuringSlideEventArgs>{
                button: this,
                slider: this.slider
            });
        }
    }

    private handleEndSlide() {
        if (this.isMouseDown) {
            document.body.style[this.getUserSelect()] = this.origUserSelect;
            document.body.style.cursor = this.origCursor;
            $$(this.element).removeClass('coveo-active');
            $$(this.element).trigger(SliderEvents.endSlide, <IEndSlideEventArgs>{
                button: this,
                slider: this.slider
            });
        }
        this.isMouseDown = false;
    }

    private handleButtonNearEnd() {
        if (this.which == 0) {
            if (this.origZIndex == undefined) {
                this.origZIndex = this.element.style.zIndex || '1';
            }
            if (this.currentPos > 90) {
                this.element.style.zIndex = this.origZIndex + 1;
            } else {
                this.element.style.zIndex = this.origZIndex;
            }
        }
    }

    private getMousePosition(e: MouseEvent) {
        let posx = 0;
        let posy = 0;
        if (e['touches'] && e['touches'][0]) {
            posx = e['touches'][0].pageX;
            posy = e['touches'][0].pageY;
        } else if (e.pageX && e.pageY) {
            posx = e.pageX;
            posy = e.pageY;
        } else if (e.clientX && e.clientY) {
            posx = e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
            posy = e.clientY + document.body.scrollTop + document.documentElement.scrollTop;
        }
        return { x: posx, y: posy };
    }

    private updatePosition(e: MouseEvent) {
        const pos = this.getMousePosition(e);
        const spanX = pos.x - this.startPositionX;
        let currentValue;
        this.currentPos = this.lastElementLeft + spanX;
        if (this.slider.options.steps || this.slider.options.getSteps) {
            const snapResult = this.snapToStep(spanX);
            this.currentPos = snapResult.position;
            currentValue = snapResult.value;
        }
        this.currentPos = Math.max(this.leftBoundary, this.currentPos);
        this.currentPos = Math.min(this.rightBoundary, this.currentPos);
        this.currentPos = this.getPercent(this.currentPos) * 100;
        this.currentPos = Math.min(this.currentPos, 100);
        this.currentPos = Math.max(this.currentPos, 0);
        this.element.style.left = Math.round(this.currentPos) + '%';
        if (this.slider.options.steps || this.slider.options.getSteps) {
            this.slider.currentValues[this.which] = currentValue;
        } else {
            this.slider.currentValues[this.which] = this.getValue();
        }
    }

    private snapToStep(spanX: number) {
        const diffs = map(this.slider.steps, (step, i) => {
            return Math.abs(this.currentPos - this.fromValueToPosition(this.slider.steps[i]));
        });
        const diffsNext = map(this.slider.steps, (step, i) => {
            return Math.abs(this.rightBoundary - this.fromValueToPosition(this.slider.steps[i]));
        });
        const diffsPrev = map(this.slider.steps, (step, i) => {
            return Math.abs(this.leftBoundary - this.fromValueToPosition(this.slider.steps[i]));
        });
        const nearest = min(diffs);
        const nearestNext = min(diffsNext);
        const nearestPrevious = min(diffsPrev);
        let currentStep = this.slider.steps[indexOf(diffs, nearest)];
        const nextStep = this.slider.steps[indexOf(diffsNext, nearestNext)];
        const previousStep = this.slider.steps[indexOf(diffsPrev, nearestPrevious)];
        currentStep = Math.min(currentStep, nextStep);
        currentStep = Math.max(currentStep, previousStep);
        return { position: this.fromValueToPosition(currentStep), value: currentStep };
    }
}

class SliderRange {
    public firstButton: SliderButton;
    public secondButton: SliderButton;

    constructor(public slider: Slider) {
        this.firstButton = new SliderButton(slider, 0);
        this.secondButton = new SliderButton(slider, 1);
    }

    public build(): HTMLElement[] {
        const firstElem = this.firstButton.build();
        const secondElem = this.secondButton.build();
        $$(secondElem).addClass('coveo-range-button');
        return [firstElem, secondElem];
    }

    public initializeSliderRangeState(values?: number[]) {
        if (values == undefined) {
            this.firstButton.toBeginning();
            this.secondButton.toEnd();
        } else {
            this.firstButton.setValue(values[0]);
            this.secondButton.setValue(values[1]);
        }
        this.setBoundary();
    }

    public setValue(values: number[]) {
        this.firstButton.setValue(values[0]);
        this.secondButton.setValue(values[1]);
    }

    public setBoundary() {
        this.firstButton.leftBoundary = 0;
        this.firstButton.rightBoundary = this.secondButton.getPosition();
        this.secondButton.leftBoundary = this.firstButton.getPosition();
        this.secondButton.rightBoundary = this.slider.element.clientWidth;
    }

    public getPosition() {
        return [this.firstButton.getPosition(), this.secondButton.getPosition()];
    }

    public getPercentPosition() {
        return [this.firstButton.getPercent(), this.secondButton.getPercent()];
    }

    public getValue() {
        return [this.firstButton.getValue(), this.secondButton.getValue()];
    }
}

class SliderCaption {
    private caption: HTMLElement;

    public unitSign: string;
    public separator: string;

    constructor(public slider: Slider) {
        this.separator = '-';
        this.unitSign = '';
        if (this.slider.options.displayAsPercent && this.slider.options.displayAsPercent.enable) {
            this.separator =
                this.slider.options.displayAsPercent.separator != undefined ? this.slider.options.displayAsPercent.separator : this.separator;
        } else if (this.slider.options.displayAsValue && this.slider.options.displayAsValue.enable) {
            this.separator =
                this.slider.options.displayAsValue.separator != undefined ? this.slider.options.displayAsValue.separator : this.separator;
            this.unitSign =
                this.slider.options.displayAsValue.unitSign != undefined ? this.slider.options.displayAsValue.unitSign : this.unitSign;
        }
    }

    public build(): HTMLElement {
        this.caption = $$('div', {
            className: 'coveo-slider-caption'
        }).el;
        return this.caption;
    }

    public getCaption() {
        return $$(this.caption).text();
    }

    public getCaptionFromValues(values: number[]) {
        return this.getValueCaption(values);
    }

    public getCaptionFromValuesAsPercent(values: number[]) {
        return this.getValueCaption(values);
    }

    public setAsValue() {
        $$(this.caption).text(this.getValueCaption());
    }

    public setFromString(str: string) {
        $$(this.caption).text(str);
    }

    private getValueCaption(values = this.slider.getValues()) {
        let first = values[0];
        let second = values[1];

        first = first.toFixed(this.slider.options.rounded);
        second = second.toFixed(this.slider.options.rounded);

        return [first, this.unitSign, this.separator, second, this.unitSign].join(' ');
    }
}

class FacetHeader {
    public element: HTMLElement;
    public iconElement: HTMLElement;
    public waitElement: HTMLElement;
    public collapseElement: HTMLElement;
    public expandElement: HTMLElement;
    public operatorElement: HTMLElement;
    public eraserElement: HTMLElement;
    public settings: FacetSettings;
    public sort: FacetSort;

    constructor(public options: IFacetHeaderOptions) {
        this.element = document.createElement('div');
        $$(this.element).addClass('coveo-facet-header');
    }

    public build(): HTMLElement {
        let titleSection = $$('div', {
            className: 'coveo-facet-header-title-section'
        });
        if (this.options.icon != undefined) {
            this.iconElement = this.buildIcon();
            titleSection.append(this.iconElement);
        }
        titleSection.append(this.buildTitle());
        this.element.appendChild(titleSection.el);

        let settingsSection = $$('div', {
            className: 'coveo-facet-header-settings-section'
        });

        if (this.options.facet) {
            // this.operatorElement = this.buildOperatorToggle();
            settingsSection.append(this.operatorElement);
            $$(this.operatorElement).toggle(this.options.facet.options.enableTogglingOperator);
        }

        if (this.options.settingsKlass) {
            this.sort = this.settings = new this.options.settingsKlass(this.options.availableSorts, this.options.facet);
            settingsSection.append(this.settings.build());
        } else if (this.options.sortKlass) {
            this.sort = new this.options.sortKlass(this.options.availableSorts, this.options.facet);
        }
        this.element.appendChild(settingsSection.el);

        return this.element;
    }

    public collapseFacet(): void {
        if (this.collapseElement && this.expandElement) {
            $$(this.collapseElement).hide();
            $$(this.expandElement).show();
        }
        $$(this.options.facetElement).addClass('coveo-facet-collapsed');
    }

    public expandFacet(): void {
        if (this.collapseElement && this.expandElement) {
            $$(this.expandElement).hide();
            $$(this.collapseElement).show();
        }
        $$(this.options.facetElement).removeClass('coveo-facet-collapsed');
    }

    public updateOperatorQueryStateModel(): void {
        if (this.options.facet && this.options.facet.options.enableTogglingOperator) {
            let valueToSet = '';
            if (this.options.facet.getSelectedValues().length != 0 || this.options.facet.getExcludedValues().length != 0) {
                valueToSet = this.options.facet.options.useAnd ? 'and' : 'or';
            }
            this.options.facet.queryStateModel.set(this.options.facet.operatorAttributeId, valueToSet);
        }
    }

    private buildIcon(): HTMLElement {
        let cssClassForIcon;
        if (this.options.icon) {
            cssClassForIcon = 'coveo-icon-custom ' + this.options.icon;
        } else {
            cssClassForIcon = 'coveo-icon ' + this.options.field.substr(1);
        }
        this.iconElement = document.createElement('div');
        $$(this.iconElement).addClass(cssClassForIcon);
        return this.iconElement;
    }

    private handleOperatorClick(): void {
        if (this.options.facet.options.useAnd) {
            this.options.facet.switchToOr();
        } else {
            this.options.facet.switchToAnd();
        }
        if (this.options.facet.getSelectedValues().length != 0) {
            const operatorNow = this.options.facet.options.useAnd ? 'AND' : 'OR';
            const operatorBefore = this.options.facet.options.useAnd ? 'OR' : 'AND';
            this.options.facet.triggerNewQuery(() =>
                this.options.facet.usageAnalytics.logSearchEvent<IAnalyticsFacetOperatorMeta>(analyticsActionCauseList.facetToggle, {
                    facetId: this.options.facet.options.id,
                    facetField: this.options.field.toString(),
                    facetOperatorBefore: operatorBefore,
                    facetOperatorAfter: operatorNow,
                    facetTitle: this.options.title
                })
            );
        }
    }

    private buildTitle(): HTMLElement {
        const title = $$('div', { className: 'coveo-facet-header-title' });
        title.text(this.options.title);
        title.setAttribute('role', 'heading');
        title.setAttribute('aria-level', '2');
        title.setAttribute('aria-label', `${l('FacetTitle', this.options.title)}.`);
        return title.el;
    }

}

Initialization.registerAutoCreateComponent(DualFieldFacetSlider);