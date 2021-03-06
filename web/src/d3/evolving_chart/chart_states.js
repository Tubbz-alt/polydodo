import * as d3 from 'd3';
import _ from 'lodash';
import { Duration } from 'luxon';

import { BAR_HEIGHT, DIMENSION, HOVERED_RECT_OPACITY } from './constants';
import { EPOCH_DURATION_MS, TRANSITION_TIME_MS, STAGES_ORDERED } from '../constants';

import '../style.css';

export const createTimelineChartCallbacks = (g, xTime, xTimeAxis, color, tooltip) =>
  Object({
    fromInitial: () => {
      const annotationRects = g.selectAll('.rect-stacked').interrupt();
      g.selectAll('text.proportion').remove();
      d3.selectAll('div.tooltip').style('opacity', 0);

      setAttrOnAnnotationRects(annotationRects, xTime, 0, color, tooltip);

      g.append('g')
        .attr('class', 'x visualization__axis')
        .attr('transform', `translate(0, ${BAR_HEIGHT})`)
        .call(xTimeAxis);
    },
    fromInstance: () => {
      const annotationRects = g.selectAll('.rect-stacked').interrupt();
      g.selectAll('text.proportion').remove();
      g.selectAll('.y.visualization__axis').remove();
      d3.selectAll('div.tooltip').style('opacity', 0);

      setAttrOnAnnotationRects(annotationRects, xTime, 0, color, tooltip);

      transitionHorizontalAxis(g, BAR_HEIGHT);
    },
  });

export const createInstanceChartCallbacks = (g, data, xTime, xTimeAxis, yAxis, color, tooltip) =>
  Object({
    fromTimeline: () => {
      const annotationRects = g.selectAll('.rect-stacked').interrupt();
      g.selectAll('text.proportion').remove();
      d3.selectAll('div.tooltip').style('opacity', 0);

      createVerticalAxis(g, yAxis, color);
      transitionHorizontalAxis(g, STAGES_ORDERED.length * BAR_HEIGHT);
      setAttrOnAnnotationRects(annotationRects, xTime, getVerticalPositionCallback(), color, tooltip);
    },
    fromBarChart: () => {
      const annotationRects = g.selectAll('.rect-stacked').interrupt();
      const xProportionCallback = getOffsetSleepStageProportionCallback(data);
      annotationRects.attr('x', xProportionCallback).attr('width', ({ end, start }) => xTime(end) - xTime(start));

      g.selectAll('text.proportion').remove();
      d3.selectAll('div.tooltip').style('opacity', 0);

      g.select('.x.visualization__axis').interrupt().transition().call(xTimeAxis);
      transitionHorizontalAxis(g, STAGES_ORDERED.length * BAR_HEIGHT);

      setAttrOnAnnotationRects(annotationRects, xTime, getVerticalPositionCallback(), color, tooltip);
    },
  });

export const createBarChartCallbacks = (g, data, xAxisLinear, yAxis, color, tip) =>
  Object({
    fromInstance: () => {
      const annotationRects = g.selectAll('.rect-stacked').interrupt();
      const xProportionCallback = getOffsetSleepStageProportionCallback(data);

      d3.selectAll('div.tooltip').style('opacity', 0);
      g.select('.x.visualization__axis').transition().call(xAxisLinear);
      transitionHorizontalAxis(g, STAGES_ORDERED.length * BAR_HEIGHT);

      setTooltip(annotationRects, tip, getVerticalPositionCallback(20))
        .transition()
        .duration(TRANSITION_TIME_MS)
        .attr('y', getVerticalPositionCallback())
        .attr('x', xProportionCallback)
        .on('end', () => setFirstRectangleToBeAsWideAsStageProportion(data, g));
    },
    fromStackedBarChart: () => {
      const annotationRects = g.selectAll('.rect-stacked').interrupt();
      g.selectAll('text.proportion').remove();
      d3.selectAll('div.tooltip').style('opacity', 0);

      createVerticalAxis(g, yAxis, color);
      transitionHorizontalAxis(g, STAGES_ORDERED.length * BAR_HEIGHT);

      setTooltip(annotationRects, tip, getVerticalPositionCallback(20))
        .transition()
        .duration(TRANSITION_TIME_MS / 2)
        .attr('y', (d) => BAR_HEIGHT * STAGES_ORDERED.indexOf(d.stage))
        .transition()
        .duration(TRANSITION_TIME_MS / 2)
        .attr('x', 0)
        .on('end', () => setFirstRectangleToBeAsWideAsStageProportion(data, g));
    },
  });

export const createStackedBarChartCallbacks = (g, data, tip) =>
  Object({
    fromBarChart: () => {
      const { annotations, firstStageIndexes, stageTimeProportions, epochs } = data;
      const firstAnnotationsByStage = _.filter(annotations, ({ stage }, index) => firstStageIndexes[stage] === index);
      const getHorizontalPositionSleepStage = ({ stage }) =>
        (getCumulativeProportionOfNightAtStart(stage, stageTimeProportions) + stageTimeProportions[stage] / 2) *
        DIMENSION.WIDTH;
      const annotationRects = g.selectAll('.rect-stacked').interrupt();
      setTooltip(annotationRects, tip, 0);
      d3.selectAll('div.tooltip').style('opacity', 0);

      g.selectAll('.y.visualization__axis').remove();
      g.selectAll('text.proportion').remove();

      transitionHorizontalAxis(g, BAR_HEIGHT);

      annotationRects
        .transition()
        .duration(TRANSITION_TIME_MS / 2)
        .attr('x', ({ stage }) => getCumulativeProportionOfNightAtStart(stage, stageTimeProportions) * DIMENSION.WIDTH)
        .attr('width', getFirstRectangleProportionWidthCallback(firstStageIndexes, stageTimeProportions))
        .transition()
        .duration(TRANSITION_TIME_MS / 2)
        .attr('y', 0);

      g.selectAll('.text')
        .data(firstAnnotationsByStage)
        .enter()
        .append('text')
        .attr('class', 'proportion')
        .style('text-anchor', 'middle')
        .append('tspan')
        .text(({ stage }) =>
          Duration.fromMillis(stageTimeProportions[stage] * epochs.length * EPOCH_DURATION_MS).toFormat('hh:mm:ss'),
        )
        .attr('x', getHorizontalPositionSleepStage)
        .attr('y', 40)
        .append('tspan')
        .text(({ stage }) => `${_.round(stageTimeProportions[stage] * 100, 2)}%`)
        .attr('x', getHorizontalPositionSleepStage)
        .attr('y', 60);
    },
  });

const setAttrOnAnnotationRects = (annotationRects, x, yBarPosition, color, tooltip) =>
  setTooltip(annotationRects, tooltip, yBarPosition)
    .attr('height', BAR_HEIGHT)
    .transition()
    .duration(TRANSITION_TIME_MS)
    .attr('x', ({ start }) => x(start))
    .attr('y', yBarPosition)
    .attr('width', ({ end, start }) => x(end) - x(start))
    .attr('fill', ({ stage }) => color(stage));

const setFirstRectangleToBeAsWideAsStageProportion = (data, g) => {
  const { firstStageIndexes, stageTimeProportions } = data;

  // Only keep the first rectangle of each stage to be visible
  g.selectAll('.rect-stacked')
    .attr('x', 0)
    .attr('width', getFirstRectangleProportionWidthCallback(firstStageIndexes, stageTimeProportions));
  createProportionLabels(g, data);
};

const setTooltip = (element, tooltip, y) =>
  element
    .on('mouseover', function () {
      tooltip.mouseover();
      d3.select(this).style('stroke', 'black').style('opacity', HOVERED_RECT_OPACITY);
    })
    .on('mousemove', function (d) {
      tooltip.mousemove(d, d3.mouse(this), `${y === 0 ? 0 : y(d)}px`);
    })
    .on('mouseout', function () {
      tooltip.mouseleave();
      d3.select(this).style('stroke', 'none').style('opacity', 1);
    });

const getVerticalPositionCallback = (cardOffset = 0) => (d) =>
  BAR_HEIGHT * STAGES_ORDERED.indexOf(d.stage) + cardOffset;

const getFirstRectangleProportionWidthCallback = (firstStageIndexes, stageTimeProportions) => ({ stage }, i) =>
  i === firstStageIndexes[stage] ? stageTimeProportions[stage] * DIMENSION.WIDTH : 0;

const createVerticalAxis = (g, yAxis, color) =>
  g
    .append('g')
    .attr('class', 'y visualization__axis')
    .style('font-size', '1.5rem')
    .transition()
    .duration(TRANSITION_TIME_MS)
    .call(yAxis)
    .selectAll('text')
    .attr('class', 'y-label')
    .attr('y', BAR_HEIGHT / 2)
    .attr('x', -10)
    .style('fill', (d) => color(d))
    .attr('text-anchor', 'left')
    .style('alignment-baseline', 'middle');

const transitionHorizontalAxis = (g, yPosition) =>
  g
    .select('.x.visualization__axis')
    .transition()
    .duration(TRANSITION_TIME_MS)
    .attr('transform', `translate(0, ${yPosition})`);

const createProportionLabels = (g, data) =>
  g
    .selectAll('text.proportion')
    .data(data.annotations)
    .enter()
    .append('text')
    .attr('class', 'proportion')
    .text(({ stage }, i) =>
      i === data.firstStageIndexes[stage] ? `${_.round(data.stageTimeProportions[stage] * 100, 2)}%` : '',
    )
    .attr('x', DIMENSION.WIDTH / 20)
    .attr('y', ({ stage }) => BAR_HEIGHT * STAGES_ORDERED.indexOf(stage) + BAR_HEIGHT / 2)
    .style('fill', 'black');

const getCumulativeProportionOfNightAtStart = (stage, totalStageProportions) =>
  _.sum(
    _.slice(
      STAGES_ORDERED.map((stage_ordered) => totalStageProportions[stage_ordered]),
      0,
      _.indexOf(STAGES_ORDERED, stage),
    ),
  );

const getOffsetSleepStageProportionCallback = (data) => {
  const { annotations, stageTimeProportions } = data;
  const cumulSumProportions = cumulSum(
    _.mapValues(stageTimeProportions, (proportion, stage) =>
      _.filter(annotations, (d) => d.stage === stage).map((annotation) => annotation.proportion / proportion),
    ),
  );
  const annotationIndexSleepStage = annotations.map((annotation) => {
    return _.indexOf(
      _.filter(annotations, (d) => d.stage === annotation.stage),
      annotation,
    );
  });

  return (d, index) =>
    DIMENSION.WIDTH * stageTimeProportions[d.stage] * cumulSumProportions[d.stage][annotationIndexSleepStage[index]];
};

const cumulSum = (annotationsProportionByStage) =>
  _.mapValues(annotationsProportionByStage, (annotationsProportion) => {
    const currentCumulSum = [0];
    annotationsProportion.forEach((proportion, index) => {
      if (index !== annotationsProportion.length - 1) {
        currentCumulSum.push(proportion + currentCumulSum[index]);
      }
    });
    return currentCumulSum;
  });
