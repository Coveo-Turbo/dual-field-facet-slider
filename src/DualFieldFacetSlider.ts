// Version 1.1.5

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
    analyticsActionCauseList,
    l,
    IBuildingQueryEventArgs,
    IDoneBuildingQueryEventArgs,
    BreadcrumbEvents,
    IPopulateBreadcrumbEventArgs,
    IBreadcrumbItem,
    IAnalyticsFacetMeta,
    IStringMap
} from 'coveo-search-ui';
// import { lazyComponent } from '@coveops/turbo-core';

export interface IDualFieldFacetSliderOptions {
    fieldMin: string;
    fieldMax: string;
    title?: string;
    id: string;
    rangeSlider?: boolean;
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

declare const require: (svgPath: string) => string;
const SVGIcon = require('./clear.svg');

// @lazyComponent
export class DualFieldFacetSlider extends Component {
    static ID = 'DualFieldFacetSlider';

    public cleanedMinField: string;
    public cleanedMaxField: string;

    public startOfSlider: number;
    public endOfSlider: number;
    public initialStartOfSlider: number;
    public initialEndOfSlider: number;

    public onResize: EventListener;
    public isEmpty = false;
    public isActive = false;

    public HiddenMinSlider: FacetSlider;
    public HiddenMaxSlider: FacetSlider;
    public dualFieldFacetSlider: FacetSlider;

    public facetHeader: FacetHeader;

    static options: IDualFieldFacetSliderOptions = {
        fieldMin: ComponentOptions.buildStringOption(),
        fieldMax: ComponentOptions.buildStringOption(),
        title: ComponentOptions.buildStringOption({ defaultValue: "DualFieldFacetSlider" }),
        id: ComponentOptions.buildStringOption({ defaultValue: "DualFieldFacetSlider" }),
        rangeSlider: ComponentOptions.buildBooleanOption({ defaultValue: true }),
        rounded: ComponentOptions.buildNumberOption({ defaultValue: 0 }),
        valueCaption: ComponentOptions.buildCustomOption<(values: number[]) => string>(() => {
            return null;
        })
    };

    constructor(public element: HTMLElement, public options: IDualFieldFacetSliderOptions, public bindings: IComponentBindings, public slider?: Slider) {
        super(element, DualFieldFacetSlider.ID, bindings);
        this.options = ComponentOptions.initComponentOptions(element, DualFieldFacetSlider, options);

        this.cleanedMinField = this.options.fieldMin.replace('@', '');
        this.cleanedMaxField = this.options.fieldMax.replace('@', '');

        this.bind.onRootElement(QueryEvents.preprocessResults, (args: IPreprocessResultsEventArgs) => this.handlePreprocessResults(args));
        this.bind.onRootElement(QueryEvents.buildingQuery, (args: IBuildingQueryEventArgs) => this.handleBuildingQuery(args));
        this.bind.onRootElement(QueryEvents.doneBuildingQuery, (args: IDoneBuildingQueryEventArgs) => this.handleDoneBuildingQuery(args));
        this.bindBreadcrumbEvents();

        Coveo.load('FacetSlider').then(
            (arg) => {
                Coveo.FacetSlider = arg as any;
                this.buildDualSlider();
            })
    }

    public buildDualSlider() {
        this.element.classList.add('CoveoFacetSlider');
        this.buildHeader();
        this.buildHiddenMinMaxSlider();
    }

    public initSlider() {
        this.slider.initializeState([this.startOfSlider, this.endOfSlider]);
        this.updateAppearanceDependingOnState();
    }

    public buildHeader() {
        this.facetHeader = new FacetHeader({
            field: <string>this.options.fieldMin,
            facetElement: this.element,
            title: this.options.title,
            enableClearElement: true,
            enableCollapseElement: true
        });

        this.element.append(this.facetHeader.build());
    }

    public buildSlider(min: number, max: number) {
        const sliderContainer = $$('div', { className: 'coveo-slider-container' }).el;

        const sliderDiv = $$('div').el;

        this.options.start = min;
        this.options.end = max;

        this.slider = this.slider
            ? this.slider
            : new Slider(sliderDiv, { ...this.options } as ISliderOptions, this.root);
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

    public reset() {
        let facetMin = Coveo.get(<HTMLElement>this.element.querySelector('#Min' + this.cleanedMinField), FacetSlider) as FacetSlider;
        let facetMax = Coveo.get(<HTMLElement>this.element.querySelector('#Max' + this.cleanedMaxField), FacetSlider) as FacetSlider;
        facetMin.reset();
        facetMax.reset();
        this.isActive = false;
    }

    public handleEndSlide(args: IEndSlideEventArgs) {
        const values = args.slider.getValues();
        this.startOfSlider = values[0];
        this.endOfSlider = values[1];

        let facetMin = Coveo.get(<HTMLElement>this.element.querySelector('#Min' + this.cleanedMinField), FacetSlider) as FacetSlider;
        let facetMax = Coveo.get(<HTMLElement>this.element.querySelector('#Max' + this.cleanedMaxField), FacetSlider) as FacetSlider;

        if (args.slider.options.start == this.startOfSlider && args.slider.options.end == this.endOfSlider) {
            facetMin.reset();
            facetMax.reset();
            this.isActive = false;
        } else {
            this.isActive = true;
            facetMin.setSelectedValues([0, values[1]]);
            facetMax.setSelectedValues([values[0], 10000000]);
            facetMin['updateQueryState']();
            facetMax['updateQueryState']();
        }

        this.usageAnalytics.logSearchEvent(analyticsActionCauseList.facetRangeSlider, {
            facetId: this.options.id,
            facetRangeStart: this.startOfSlider.toString(),
            facetRangeEnd: this.endOfSlider.toString()
        });
        this.queryController.executeQuery();

    }

    private bindBreadcrumbEvents() {
        this.bind.onRootElement(BreadcrumbEvents.clearBreadcrumb, () => this.reset());
        this.bind.onRootElement(BreadcrumbEvents.populateBreadcrumb, (args: IPopulateBreadcrumbEventArgs) =>
            this.handlePopulateBreadcrumb(args)
        );
    }

    private handlePopulateBreadcrumb(args: IPopulateBreadcrumbEventArgs): void {
        const populateBreadcrumb = () => {
            if (this.isActive) {
                args.breadcrumbs.push(<IBreadcrumbItem>{
                    element: this.buildBreadcrumbFacetSlider()
                });
            }
        };
        if (this.slider) {
            populateBreadcrumb();
        } else {
            $$(this.root).one(QueryEvents.deferredQuerySuccess, () => {
                populateBreadcrumb();
                $$(this.root).trigger(BreadcrumbEvents.redrawBreadcrumb);
            });
        }
    }

    private buildBreadcrumbFacetSlider(): HTMLElement {
        const elem = $$('div', {
            className: 'coveo-facet-slider-breadcrumb dual-field-facet-slider ' + this.options.id
        }).el;

        const title = $$('span', {
            className: 'coveo-facet-slider-breadcrumb-title'
        });
        title.text(this.options.title + ': ');
        elem.appendChild(title.el);

        const values = $$('span', {
            className: 'coveo-facet-slider-breadcrumb-values'
        });
        elem.appendChild(values.el);

        const value = $$('span', {
            className: 'coveo-facet-slider-breadcrumb-value'
        });
        const caption = $$('span', {
            className: 'coveo-facet-slider-breadcrumb-caption'
        });
        caption.text(this.slider.getCaption());
        value.append(caption.el);
        values.el.appendChild(value.el);
        const clear = $$(
            'span',
            {
                className: 'coveo-facet-slider-breadcrumb-clear'
            },
            SVGIcon
        );
        SVGDom.addClassToSVGInContainer(clear.el, 'coveo-facet-slider-clear-svg');

        value.el.appendChild(clear.el);

        value.on('click', () => {
            this.reset();
            this.usageAnalytics.logSearchEvent<IAnalyticsFacetMeta>(analyticsActionCauseList.facetClearAll, {
                facetId: this.options.id,
                facetField: this.options.fieldMin.toString(),
                facetTitle: this.options.title
            });
            this.queryController.executeQuery();
        });
        return elem;
    }

    public handleDuringSlide(args: IDuringSlideEventArgs) {
        const values = args.slider.getValues();
        this.startOfSlider = values[0];
        this.endOfSlider = values[1];
        this.slider.setValues([this.startOfSlider, this.endOfSlider]);
        this.updateAppearanceDependingOnState(true);
    }

    public updateAppearanceDependingOnState(sliding = false) {
        // Defer the visual update so that we can execute it after the current call stack has resolved.
        // Since this component is closely linked to DOM size calculation (width), this allows to cover some corner cases
        // where the component would be visually hidden, leading to incorrect width calculation.
        // For example, first query placeholder animation hiding the component, or switching between different tabs would affect the calculation otherwise.
        Defer.defer(() => {
            if (this.isEmpty && !this.isActive && !sliding) {
                $$(this.element).addClass('coveo-disabled-empty');
            } else {
                $$(this.element).removeClass('coveo-disabled-empty');
            }
            if (!this.isActive && !sliding) {
                $$(this.element).addClass('coveo-disabled');
            } else {
                $$(this.element).removeClass('coveo-disabled');
            }

            if (this.isActive && this.slider) {
                this.slider.onMoving();
            }
        });
    }

    public buildHiddenMinMaxSlider() {
        const elem = $$('div');
        let optionsMin = {
            id: 'Min' + this.cleanedMinField,
            title: 'Min' + this.cleanedMinField,
            field: this.options.fieldMin,
            start: 0,
            end: 10000000,
            rangeSlider: true
        }
        this.HiddenMinSlider = new Coveo.FacetSlider(elem.el, optionsMin, this.bindings);
        elem.el.id = 'Min' + this.cleanedMinField;
        elem.el.style.display = 'none';
        this.element.append(this.HiddenMinSlider.element);

        const elem2 = $$('div');
        let optionsMax = {
            id: 'Max' + this.cleanedMaxField,
            title: 'Max' + this.cleanedMaxField,
            field: this.options.fieldMax,
            start: 0,
            end: 10000000,
            rangeSlider: true
        }
        this.HiddenMaxSlider = new Coveo.FacetSlider(elem2.el, optionsMax, this.bindings);
        elem2.el.id = 'Max' + this.cleanedMaxField;
        elem2.el.style.display = 'none';
        this.element.append(this.HiddenMaxSlider.element);
    }

    public handleBuildingQuery(args: IBuildingQueryEventArgs) {
        args.queryBuilder.groupByRequests.push({
            field: this.options.fieldMin,
            computedFields: [
                {
                    field: this.options.fieldMin,
                    operation: "minimum"
                }
            ],
            "maximumNumberOfValues": 1
        });
        args.queryBuilder.groupByRequests.push({
            field: this.options.fieldMax,
            computedFields: [
                {
                    field: this.options.fieldMax,
                    operation: "maximum"
                }
            ],
            "maximumNumberOfValues": 1
        });
    }

    public handleDoneBuildingQuery(args: IDoneBuildingQueryEventArgs) {
        args.queryBuilder.advancedExpression['parts'].forEach((part, index, theArray) => {
            if (part.indexOf(this.cleanedMinField) != -1) {
                let valueToReplace = part.split('==')[1].split('..')[1];
                theArray[index] = part.replace(valueToReplace, parseInt(valueToReplace));
            }

            if (part.indexOf(this.cleanedMaxField) != -1) {
                let valueToReplace = part.split('==')[1].split('..')[0];
                theArray[index] = part.replace(valueToReplace, parseInt(valueToReplace));
            }
        });
    }

    public handlePreprocessResults(args: IPreprocessResultsEventArgs) {

        let value = _.filter(args.results.groupByResults, (item) => { return item.globalComputedFieldResults.length > 0 });
        if (value.length > 0){
            let itemMin = _.filter(value, (item) => { return item.field == this.cleanedMinField })[0];
            let itemMax = _.filter(value, (item) => { return item.field == this.cleanedMaxField })[0];
    
            let currentMin = itemMin['GlobalComputedFieldResults'][0];
            let currentMax = itemMax['GlobalComputedFieldResults'][0];
    
            if (currentMin == currentMax && !this.isActive) {
                this.element.style.display = 'none';
            } else {
                this.element.style.display = 'block';
                if (!this.isActive) {
                    if (this.element.querySelector('.coveo-slider-container')) {
                        delete this.slider;
                        this.element.lastElementChild.remove();
                    }
                    this.buildSlider(currentMin, currentMax);
                    this.slider.initializeState([currentMin, currentMax]);
                    this.updateAppearanceDependingOnState();
                    this.isActive = (currentMin != this.options.start || currentMax != this.options.end);
                }
            }
        }else{
            this.element.style.display = 'none';
        }
        
    }

}

class Slider {
    public steps: number[] = [];
    public currentValues: number[];
    public sliderButton: SliderButton;
    public sliderRange: SliderRange;
    public sliderLine: SliderLine;
    public sliderCaption: SliderCaption;

    constructor(public element: HTMLElement, public options: ISliderOptions, public root: HTMLElement) {

        if (this.options.rounded == undefined) {
            this.options.rounded = 0;
        }

        if (this.options.steps || this.options.getSteps) {
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
        if (values[0] == undefined || values[1] == undefined) {
            values = [this.options.start, this.options.end];
        }
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

    public setButtonBoundary() {
        this.sliderButton.leftBoundary = 0;
        this.sliderButton.rightBoundary = this.element.clientWidth;
    }

    public displayCaption() {
        if (this.options.valueCaption != undefined) {
            this.sliderCaption.setFromString(this.options.valueCaption(this.getValues()));
        } else if (this.options.percentCaption != undefined) {
            this.sliderCaption.setFromString(this.options.percentCaption(this.getPercentPosition()));
        } else {
            this.sliderCaption.setAsValue();
        }
    }

    public buildSteps() {
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
    public backGround: HTMLElement;
    public activePart: HTMLElement;

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
    public currentPos: number;
    public startPositionX: number;
    public isMouseDown: boolean;
    public lastElementLeft: number;
    public origUserSelect: string;
    public origCursor: string;
    public origZIndex: string;

    public eventMouseDown = DeviceUtils.isMobileDevice() ? 'touchstart' : 'mousedown';
    public eventMouseMove = DeviceUtils.isMobileDevice() ? 'touchmove' : 'mousemove';
    public eventMouseUp = DeviceUtils.isMobileDevice() ? 'touchend' : 'mouseup';

    constructor(public slider: Slider, public which: number) { }

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

    public bindEvents() {
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

    public getUserSelect() {
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

    public handleStartSlide(e: MouseEvent) {
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

    public handleMoving(e: MouseEvent) {
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

    public handleEndSlide() {
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

    public handleButtonNearEnd() {
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

    public getMousePosition(e: MouseEvent) {
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

    public updatePosition(e: MouseEvent) {
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

    public snapToStep(spanX: number) {
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
    public caption: HTMLElement;

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

    public getValueCaption(values = this.slider.getValues()) {
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

    public buildIcon(): HTMLElement {
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

    public buildTitle(): HTMLElement {
        const title = $$('div', { className: 'coveo-facet-header-title' });
        title.text(this.options.title);
        title.setAttribute('role', 'heading');
        title.setAttribute('aria-level', '2');
        title.setAttribute('aria-label', `${l('FacetTitle', this.options.title)}.`);
        return title.el;
    }

}

class SVGDom {
    public static addClassToSVGInContainer(svgContainer: HTMLElement, classToAdd: string) {
        const svgElement = svgContainer.querySelector('svg');
        svgElement.setAttribute('class', `${SVGDom.getClass(svgElement)}${classToAdd}`);
    }

    public static removeClassFromSVGInContainer(svgContainer: HTMLElement, classToRemove: string) {
        const svgElement = svgContainer.querySelector('svg');
        svgElement.setAttribute('class', SVGDom.getClass(svgElement).replace(classToRemove, ''));
    }

    public static addStyleToSVGInContainer(svgContainer: HTMLElement, styleToAdd: IStringMap<any>) {
        const svgElement = svgContainer.querySelector('svg');
        each(styleToAdd, (styleValue, styleKey) => {
            svgElement.style[styleKey] = styleValue;
        });
    }

    public static addAttributesToSVGInContainer(svgContainer: HTMLElement, attributesToAdd: IStringMap<string>) {
        const svgElement = svgContainer.querySelector('svg');
        each(attributesToAdd, (attributeValue, attributeKey) => {
            svgElement.setAttribute(attributeKey, attributeValue);
        });
    }

    private static getClass(svgElement: SVGElement) {
        const className = svgElement.getAttribute('class');
        return className ? className + ' ' : '';
    }
}

Initialization.registerAutoCreateComponent(DualFieldFacetSlider);